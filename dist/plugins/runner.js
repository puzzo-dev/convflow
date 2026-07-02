import { guardedFetch, getUrlTemplateOrigin } from '../engine/webhook-util';
import { getPlugin } from './registry';
import { resolveCreds } from './credentials';
// Template interpolation: {creds.x}, {input.x}, {answers.x} (label-preferred),
// {name}, {phone}.
export function interpolateTemplate(tpl, ctx) {
    return tpl.replace(/\{([^}]+)\}/g, (_, expr) => resolveExpr(expr, ctx));
}
function resolveExpr(expr, ctx) {
    if (expr === 'name')
        return ctx.name ?? '';
    if (expr === 'phone')
        return ctx.phone ?? '';
    const dot = expr.indexOf('.');
    if (dot === -1)
        return '';
    const ns = expr.slice(0, dot);
    const key = expr.slice(dot + 1);
    if (ns === 'creds')
        return ctx.creds[key] ?? '';
    if (ns === 'input')
        return String(ctx.input[key] ?? '');
    if (ns === 'answers')
        return ctx.answers[`${key}_label`] ?? ctx.answers[key] ?? '';
    return '';
}
// URL-safe variant: encodes every substituted value so user answers cannot change
// the origin, path, or query structure of the configured plugin URL.
function interpolateUrlTemplate(tpl, ctx) {
    return tpl.replace(/\{([^}]+)\}/g, (_, expr) => encodeURIComponent(resolveExpr(expr, ctx)));
}
function interpHeaders(headers, ctx) {
    const out = {};
    for (const [k, v] of Object.entries(headers ?? {}))
        out[k] = interpolateTemplate(v, ctx);
    return out;
}
function pluck(obj, path) {
    if (!path)
        return obj;
    return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
// Execute a plugin action for a tenant. Mutates state.answers if saveResponseTo
// is set. Throws on any failure (caller isolates it).
export async function runPluginAction(action, state, phone, company) {
    const manifest = getPlugin(action.pluginId);
    if (!manifest)
        throw new Error(`Unknown plugin "${action.pluginId}"`);
    const def = manifest.actions.find(a => a.id === action.actionId);
    if (!def)
        throw new Error(`Unknown action "${action.actionId}" on plugin "${action.pluginId}"`);
    const creds = await resolveCreds(manifest, company.slug);
    const ctx = { creds, input: action.inputs ?? {}, answers: state.answers, name: state.name, phone };
    const allowedOrigin = getUrlTemplateOrigin(def.url);
    const url = interpolateUrlTemplate(def.url, ctx);
    const headers = { 'Content-Type': 'application/json', ...interpHeaders(def.headers, ctx) };
    let body;
    if (def.bodyFrom === 'fields') {
        const fields = (action.inputs?.fields ?? {});
        const mapped = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, interpolateTemplate(String(v), ctx)]));
        body = JSON.stringify(mapped);
    }
    const res = await guardedFetch(url, { method: def.verb, headers, body }, allowedOrigin);
    if (!res.ok)
        throw new Error(`${def.verb} ${url} → ${res.status}`);
    if (action.saveResponseTo) {
        const json = await res.json().catch(() => null);
        const val = action.responsePath ? pluck(json, action.responsePath) : json;
        state.answers[action.saveResponseTo] = typeof val === 'string' ? val : JSON.stringify(val ?? '');
        return true;
    }
    return false;
}
// ── Live per-tenant option lists (e.g. doctypes) ─────────────────────────────
export async function resolvePluginOptions(companySlug, pluginId, optionKey) {
    const manifest = getPlugin(pluginId);
    const def = manifest?.dynamicOptions?.[optionKey];
    if (!manifest || !def)
        throw new Error(`Unknown option "${optionKey}" for plugin "${pluginId}"`);
    const creds = await resolveCreds(manifest, companySlug);
    const ctx = { creds, input: {}, answers: {}, name: null, phone: '' };
    const allowedOrigin = getUrlTemplateOrigin(def.url);
    const url = interpolateUrlTemplate(def.url, ctx);
    const res = await guardedFetch(url, {
        method: def.verb,
        headers: interpHeaders(def.headers, ctx),
    }, allowedOrigin);
    if (!res.ok)
        throw new Error(`Option fetch failed: ${res.status}`);
    const json = await res.json().catch(() => null);
    const items = pluck(json, def.itemsPath) ?? [];
    return items.map(it => ({ label: String(it[def.labelKey]), value: String(it[def.valueKey]) }));
}
