import { prisma } from '../store/prisma';
import { PluginManifest } from './types';
import { erpnextPlugin } from './erpnext.plugin';

// Built-in plugins ship with the platform and cannot be uninstalled.
const BUILTINS: Record<string, PluginManifest> = {
  [erpnextPlugin.id]: erpnextPlugin,
};

// In-memory cache of ACTIVE manifests (built-ins + enabled installed plugins).
// Rebuilt at startup and after any install/enable/disable/uninstall.
let cache = new Map<string, PluginManifest>(Object.entries(BUILTINS));

export async function refreshPlugins(): Promise<void> {
  const next = new Map<string, PluginManifest>(Object.entries(BUILTINS));
  try {
    const rows = await prisma.plugin.findMany({ where: { enabled: true } });
    for (const r of rows) next.set(r.pluginId, r.manifest as unknown as PluginManifest);
  } catch (err: any) {
    console.error('refreshPlugins: failed to load installed plugins:', err.message);
  }
  cache = next;
}

// Runtime lookups (used by the engine runner + tenant-facing routes).
export function getPlugin(id: string): PluginManifest | null {
  return cache.get(id) ?? null;
}
export function listPlugins(): PluginManifest[] {
  return [...cache.values()];
}

export function isBuiltin(pluginId: string): boolean {
  return pluginId in BUILTINS;
}

// Admin view: built-ins + every installed row, with management metadata.
export async function listPluginsForAdmin(): Promise<Array<{
  pluginId: string; name: string; version: string; enabled: boolean; builtin: boolean; actionsCount: number;
}>> {
  const builtins = Object.values(BUILTINS).map(m => ({
    pluginId: m.id, name: m.name, version: '—', enabled: true, builtin: true, actionsCount: m.actions.length,
  }));
  const rows = await prisma.plugin.findMany({ orderBy: { createdAt: 'desc' } });
  const installed = rows.map(r => ({
    pluginId: r.pluginId, name: r.name, version: r.version, enabled: r.enabled, builtin: false,
    actionsCount: Array.isArray((r.manifest as any)?.actions) ? (r.manifest as any).actions.length : 0,
  }));
  return [...builtins, ...installed];
}
