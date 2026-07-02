import { prisma } from '../store/prisma';
import { PluginManifest } from './types';
import { decryptJson } from '../notifications/crypto';

// Resolve a plugin's credentials FOR A SPECIFIC TENANT. ERPNext reuses the
// tenant's existing ErpnextConnection; 'stored' plugins read their own
// per-tenant encrypted PluginCredential row.
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

  // 'stored' source — per-tenant encrypted credentials.
  const row = await prisma.pluginCredential.findUnique({
    where: { companySlug_pluginId: { companySlug, pluginId: manifest.id } },
  });
  if (!row) throw new Error(`"${manifest.name}" is not configured for this bot.`);
  return decryptJson<Record<string, string>>(row.credentials);
}

// Whether a tenant has configured this plugin (drives availability in the builder).
export async function isPluginConfigured(manifest: PluginManifest, companySlug: string): Promise<boolean> {
  if (manifest.credentials.source === 'erpnext_connection') {
    const conn = await prisma.erpnextConnection.findUnique({ where: { companySlug } });
    return !!conn && conn.status === 'connected';
  }
  const row = await prisma.pluginCredential.findUnique({
    where: { companySlug_pluginId: { companySlug, pluginId: manifest.id } },
    select: { id: true },
  });
  return !!row;
}
