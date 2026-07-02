import { prisma } from '../store/prisma';
import { erpnextPlugin } from './erpnext.plugin';
// Built-in plugins ship with the platform and cannot be uninstalled.
const BUILTINS = {
    [erpnextPlugin.id]: erpnextPlugin,
};
// In-memory cache of ACTIVE manifests (built-ins + enabled installed plugins).
// Rebuilt at startup and after any install/enable/disable/uninstall.
let cache = new Map(Object.entries(BUILTINS));
export async function refreshPlugins() {
    const next = new Map(Object.entries(BUILTINS));
    try {
        const rows = await prisma.plugin.findMany({ where: { enabled: true } });
        for (const r of rows)
            next.set(r.pluginId, r.manifest);
    }
    catch (err) {
        console.error('refreshPlugins: failed to load installed plugins:', err.message);
    }
    cache = next;
}
// Runtime lookups (used by the engine runner + tenant-facing routes).
export function getPlugin(id) {
    return cache.get(id) ?? null;
}
export function listPlugins() {
    return [...cache.values()];
}
export function isBuiltin(pluginId) {
    return pluginId in BUILTINS;
}
// Admin view: built-ins + every installed row, with management metadata.
export async function listPluginsForAdmin() {
    const builtins = Object.values(BUILTINS).map(m => ({
        pluginId: m.id, name: m.name, version: '—', enabled: true, builtin: true, actionsCount: m.actions.length,
    }));
    const rows = await prisma.plugin.findMany({ orderBy: { createdAt: 'desc' } });
    const installed = rows.map(r => ({
        pluginId: r.pluginId, name: r.name, version: r.version, enabled: r.enabled, builtin: false,
        actionsCount: Array.isArray(r.manifest?.actions) ? r.manifest.actions.length : 0,
    }));
    return [...builtins, ...installed];
}
