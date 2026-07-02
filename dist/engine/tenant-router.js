import { prisma } from '../store/prisma';
let cache = new Map(); // key: openwaSessionId
export async function refreshTenantCache() {
    const tenants = await prisma.tenant.findMany({ where: { active: true } });
    // Build into a fresh Map and swap atomically — any in-flight lookups that
    // race against this operation will see either the old or new Map in full,
    // never a half-populated one.
    const next = new Map();
    for (const tenant of tenants) {
        const config = tenant.configJson;
        next.set(config.openwaSessionId, config);
    }
    cache = next;
}
export function getCompanyBySessionId(sessionId) {
    return cache.get(sessionId) ?? null;
}
// Hot-reload single tenant after dashboard config update
export function reloadTenant(config) {
    if (config.active === false) {
        cache.delete(config.openwaSessionId);
    }
    else {
        cache.set(config.openwaSessionId, config);
    }
}
