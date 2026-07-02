import { guardedFetch, getUrlTemplateOrigin } from './webhook-util';
import { notifyOwner } from '../notifications/notifier';
import { notify } from '../notifications/notify.service';
import { runPluginAction } from '../plugins/runner';
import { prisma } from '../store/prisma';
import { setState } from '../store/redis';
// Build a plain-text lead summary that reads well on email, SMS and WhatsApp.
function buildSummary(state, phone, company) {
    const answerLines = Object.entries(state.answers)
        .filter(([k]) => !k.endsWith('_label') && !k.startsWith('_dynamic'))
        .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${state.answers[`${k}_label`] ?? v}`)
        .join('\n');
    return [
        `New notification — ${company.name}`,
        `Name: ${state.name ?? 'Unknown'}`,
        `Number: +${phone}`,
        answerLines || '(no answers collected)',
    ].join('\n');
}
async function runNotify(action, state, phone, company) {
    const channels = action.channels?.length ? action.channels : ['whatsapp'];
    // The notification targets the bot's owner. Resolve the owner User so we can
    // use their configured channels (with global fallback inside notify()).
    const tenant = await prisma.tenant.findUnique({ where: { slug: company.slug }, select: { id: true } });
    const membership = tenant
        ? await prisma.tenantMembership.findFirst({
            where: { tenantId: tenant.id, role: 'owner' },
            include: { user: { select: { id: true, email: true } } },
        })
        : null;
    // No owner user on record — fall back to the legacy direct-WhatsApp path.
    if (!membership) {
        await notifyOwner(company, phone, state, 0, 'notification');
        return;
    }
    await notify({
        userId: membership.userId,
        channels,
        message: buildSummary(state, phone, company),
        subject: `New notification — ${company.name}`,
        targets: { whatsapp: company.ownerPhone, sms: company.ownerPhone, email: membership.user.email },
    });
}
// Token interpolation for action URLs / body values: {name}, {phone}, {answers.key}.
function interp(template, state, phone) {
    return template
        .replace(/\{name\}/g, state.name ?? '')
        .replace(/\{phone\}/g, phone)
        .replace(/\{answers\.([^}]+)\}/g, (_, key) => state.answers[`${key}_label`] ?? state.answers[key] ?? '');
}
// URL-safe interpolation: encode user-controlled tokens so they cannot escape the
// intended origin, path, or query parameter.
function interpUrl(template, state, phone) {
    return template
        .replace(/\{name\}/g, encodeURIComponent(state.name ?? ''))
        .replace(/\{phone\}/g, encodeURIComponent(phone))
        .replace(/\{answers\.([^}]+)\}/g, (_, key) => encodeURIComponent(state.answers[`${key}_label`] ?? state.answers[key] ?? ''));
}
function pluck(obj, path) {
    return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
async function runHttpRequest(action, state, phone, company) {
    const method = action.method ?? 'POST';
    // Lock the origin to whatever the tenant admin configured; user answers can only
    // fill path/query segments and are URL-encoded so they cannot escape the host.
    const allowedOrigin = getUrlTemplateOrigin(action.url);
    const url = interpUrl(action.url, state, phone);
    // Custom body (token-interpolated values) or the standard lead payload.
    let body;
    if (method !== 'GET') {
        const payload = action.body
            ? Object.fromEntries(Object.entries(action.body).map(([k, v]) => [k, interp(v, state, phone)]))
            : { companySlug: company.slug, phone, name: state.name, answers: state.answers };
        body = JSON.stringify(payload);
    }
    const res = await guardedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(action.headers ?? {}) },
        body,
    }, allowedOrigin);
    if (!res.ok)
        throw new Error(`${method} ${url} responded ${res.status}`);
    // Optionally capture part of the response back into the conversation answers.
    if (action.saveResponseTo) {
        const json = await res.json().catch(() => null);
        const value = action.responsePath ? pluck(json, action.responsePath) : json;
        state.answers[action.saveResponseTo] =
            typeof value === 'string' ? value : JSON.stringify(value ?? '');
    }
}
async function runAction(action, state, phone, company) {
    switch (action.type) {
        case 'http_request':
            await runHttpRequest(action, state, phone, company);
            break;
        case 'notify_owner':
            await runNotify(action, state, phone, company);
            break;
        case 'plugin':
            await runPluginAction(action, state, phone, company);
            break;
        default:
            console.error(`[${company.slug}] runAction: unknown action type "${action.type}"`);
    }
}
// An action is effectively blocking if it must complete before the flow advances:
// explicitly flagged, OR it writes a response back into state.answers.
function isBlocking(a) {
    return !!a.blocking
        || (a.type === 'http_request' && !!a.saveResponseTo)
        || (a.type === 'plugin' && !!a.saveResponseTo);
}
/**
 * Run a stage's actions when its answer is accepted.
 *
 * Blocking actions (or any that capture a response) are awaited IN ORDER before
 * the caller advances the flow — so a later step can rely on their result and
 * on state.answers being persisted. Remaining actions run detached, in order,
 * so a slow endpoint never stalls the customer's next message.
 *
 * Returns true if state.answers was mutated (caller should re-persist state).
 */
export async function runNodeActions(stage, state, phone, company) {
    const actions = stage.actions ?? [];
    if (actions.length === 0)
        return false;
    let mutated = false;
    for (const action of actions) {
        if (isBlocking(action)) {
            try {
                await runAction(action, state, phone, company);
                if ((action.type === 'http_request' || action.type === 'plugin') && action.saveResponseTo)
                    mutated = true;
            }
            catch (err) {
                console.error(`[${company.slug}] blocking action on stage "${stage.id}" failed:`, err.message);
            }
        }
        else {
            // Detached: run in the background, isolated so failures never surface to the flow.
            void runAction(action, state, phone, company).catch((err) => console.error(`[${company.slug}] action on stage "${stage.id}" failed:`, err.message));
        }
    }
    return mutated;
}
// Fire actions for info / silent stages that have no user answer (message, media,
// branch). Everything is treated as background since there is nothing to wait on.
export async function runEntryActions(stage, state, phone, company) {
    const mutated = await runNodeActions(stage, state, phone, company);
    if (mutated)
        await setState(phone, company.slug, state);
    return mutated;
}
