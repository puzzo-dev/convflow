import { prisma } from '../store/prisma';
import { CompanyConfig } from '../types';

let cache = new Map<string, CompanyConfig>(); // key: openwaSessionId

export async function refreshTenantCache(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ where: { active: true } });
  // Build into a fresh Map and swap atomically — any in-flight lookups that
  // race against this operation will see either the old or new Map in full,
  // never a half-populated one.
  const next = new Map<string, CompanyConfig>();
  for (const tenant of tenants) {
    const config = tenant.configJson as unknown as CompanyConfig;
    next.set(config.openwaSessionId, config);
  }
  cache = next;
}

export function getCompanyBySessionId(sessionId: string): CompanyConfig | null {
  return cache.get(sessionId) ?? null;
}

// Hot-reload single tenant after dashboard config update
export function reloadTenant(config: CompanyConfig): void {
  if (config.active === false) {
    cache.delete(config.openwaSessionId);
  } else {
    cache.set(config.openwaSessionId, config);
  }
}
