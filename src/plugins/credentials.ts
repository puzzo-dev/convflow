import { prisma } from '../store/prisma';
import { PluginManifest } from './types';

// Resolve a plugin's credentials FOR A SPECIFIC TENANT. ERPNext reuses the
// tenant's existing ErpnextConnection, so there's no duplicate credential entry.
export async function resolveCreds(manifest: PluginManifest, companySlug: string): Promise<Record<string, string>> {
  if (manifest.credentials.source === 'erpnext_connection') {
    const conn = await prisma.erpnextConnection.findUnique({ where: { companySlug } });
    if (!conn)                         throw new Error('ERPNext is not connected for this bot.');
    if (conn.status !== 'connected')   throw new Error('ERPNext connection is not active for this bot.');
    return {
      baseUrl:   conn.erpnextUrl.replace(/\/+$/, ''),
      apiKey:    conn.apiKey,
      apiSecret: conn.apiSecret,
    };
  }
  // 'stored' source (future generic plugins) would read a per-tenant PluginInstall row.
  throw new Error(`Unsupported credential source for plugin "${manifest.id}"`);
}

// Whether a tenant has configured this plugin (drives availability in the builder).
export async function isPluginConfigured(manifest: PluginManifest, companySlug: string): Promise<boolean> {
  if (manifest.credentials.source === 'erpnext_connection') {
    const conn = await prisma.erpnextConnection.findUnique({ where: { companySlug } });
    return !!conn && conn.status === 'connected';
  }
  return false;
}
