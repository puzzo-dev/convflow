import { FastifyInstance } from 'fastify';
import { requireAuth, requireBotAccess, requireBotRole, requireAdmin } from '../platform/auth/auth.middleware';
import { prisma } from '../store/prisma';
import { listPlugins, getPlugin, listPluginsForAdmin, isBuiltin, refreshPlugins } from './registry';
import { isPluginConfigured, resolveCreds } from './credentials';
import { resolvePluginOptions } from './runner';
import { validateManifest } from './validate';
import { encryptJson } from '../notifications/crypto';

export default async function pluginRoutes(app: FastifyInstance) {
  // ── Admin: manage the global plugin registry at runtime ──────────────────────
  app.get('/platform/admin/plugins', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    reply.send({ plugins: await listPluginsForAdmin() });
  });

  // Install (or update) a plugin from a pasted manifest — no redeploy needed.
  app.post('/platform/admin/plugins', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const body = req.body as any;
    const raw  = body?.manifest ?? body;
    let manifest;
    try {
      manifest = validateManifest(raw);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
    if (isBuiltin(manifest.id)) {
      return reply.status(409).send({ error: `"${manifest.id}" is a built-in plugin and cannot be overridden.` });
    }

    const saved = await prisma.plugin.upsert({
      where:  { pluginId: manifest.id },
      update: { name: manifest.name, version: body.version ?? '1.0.0', manifest: manifest as object },
      create: { pluginId: manifest.id, name: manifest.name, version: body.version ?? '1.0.0', manifest: manifest as object },
    });
    await refreshPlugins();
    reply.status(201).send({ plugin: { pluginId: saved.pluginId, name: saved.name, enabled: saved.enabled } });
  });

  // Enable / disable an installed plugin.
  app.patch('/platform/admin/plugins/:pluginId', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { pluginId } = req.params as any;
    const { enabled }  = req.body as any;
    if (isBuiltin(pluginId)) return reply.status(400).send({ error: 'Built-in plugins are always enabled.' });
    const existing = await prisma.plugin.findUnique({ where: { pluginId } });
    if (!existing) return reply.status(404).send({ error: 'Plugin not found' });
    await prisma.plugin.update({ where: { pluginId }, data: { enabled: !!enabled } });
    await refreshPlugins();
    reply.send({ pluginId, enabled: !!enabled });
  });

  // Uninstall an installed plugin.
  app.delete('/platform/admin/plugins/:pluginId', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { pluginId } = req.params as any;
    if (isBuiltin(pluginId)) return reply.status(400).send({ error: 'Built-in plugins cannot be uninstalled.' });
    const existing = await prisma.plugin.findUnique({ where: { pluginId } });
    if (!existing) return reply.status(404).send({ error: 'Plugin not found' });
    await prisma.plugin.delete({ where: { pluginId } });
    await refreshPlugins();
    reply.status(204).send();
  });

  // Global catalog of plugins (definitions only — no secrets exist in a manifest).
  app.get('/platform/plugins', { preHandler: [requireAuth] }, async (_req, reply) => {
    const plugins = listPlugins().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      credentialSource: p.credentials.source,
      // Field defs for "stored" plugins so tenants can enter their own creds.
      credentialFields: p.credentials.source === 'stored' ? p.credentials.fields : [],
      actions: p.actions.map(a => ({ id: a.id, label: a.label, verb: a.verb, inputs: a.inputs })),
    }));
    reply.send({ plugins });
  });

  // ── Per-tenant credentials for "stored" plugins ──────────────────────────────
  // GET status + field defs (never values).
  app.get('/platform/bots/:slug/plugins/:pluginId/credentials',
    { preHandler: [requireAuth, requireBotAccess] },
    async (req, reply) => {
      const { slug, pluginId } = req.params as any;
      const manifest = getPlugin(pluginId);
      if (!manifest) return reply.status(404).send({ error: 'Unknown plugin' });
      if (manifest.credentials.source !== 'stored') {
        return reply.status(400).send({ error: 'This plugin does not use stored credentials.' });
      }
      const configured = await isPluginConfigured(manifest, slug);
      reply.send({ pluginId, configured, fields: manifest.credentials.fields });
    },
  );

  // POST — save/replace credentials (encrypted). Owner/admin only.
  app.post('/platform/bots/:slug/plugins/:pluginId/credentials',
    { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] },
    async (req, reply) => {
      const { slug, pluginId } = req.params as any;
      const { credentials } = req.body as any;
      const manifest = getPlugin(pluginId);
      if (!manifest) return reply.status(404).send({ error: 'Unknown plugin' });
      if (manifest.credentials.source !== 'stored') {
        return reply.status(400).send({ error: 'This plugin does not use stored credentials.' });
      }
      if (!credentials || typeof credentials !== 'object') {
        return reply.status(400).send({ error: 'credentials object is required' });
      }
      await prisma.pluginCredential.upsert({
        where:  { companySlug_pluginId: { companySlug: slug, pluginId } },
        update: { credentials: encryptJson(credentials) },
        create: { companySlug: slug, pluginId, credentials: encryptJson(credentials) },
      });
      reply.status(201).send({ configured: true });
    },
  );

  // DELETE — remove stored credentials. Owner/admin only.
  app.delete('/platform/bots/:slug/plugins/:pluginId/credentials',
    { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] },
    async (req, reply) => {
      const { slug, pluginId } = req.params as any;
      await prisma.pluginCredential.deleteMany({ where: { companySlug: slug, pluginId } });
      reply.status(204).send();
    },
  );

  // Per-tenant status: is this plugin configured for this bot?
  app.get('/platform/bots/:slug/plugins/:pluginId/status',
    { preHandler: [requireAuth, requireBotAccess] },
    async (req, reply) => {
      const { slug, pluginId } = req.params as any;
      const manifest = getPlugin(pluginId);
      if (!manifest) return reply.status(404).send({ error: 'Unknown plugin' });
      const configured = await isPluginConfigured(manifest, slug);
      reply.send({ pluginId, configured });
    },
  );

  // Live, per-tenant option list (e.g. ERPNext doctypes) — fetched from the
  // tenant's own connected system using its own credentials.
  app.get('/platform/bots/:slug/plugins/:pluginId/options/:optionKey',
    { preHandler: [requireAuth, requireBotAccess] },
    async (req, reply) => {
      const { slug, pluginId, optionKey } = req.params as any;
      try {
        const options = await resolvePluginOptions(slug, pluginId, optionKey);
        reply.send({ options });
      } catch (err: any) {
        reply.status(400).send({ error: err.message, options: [] });
      }
    },
  );

  // Optional: expose the raw resolved base URL for display (never secrets).
  app.get('/platform/bots/:slug/plugins/:pluginId/meta',
    { preHandler: [requireAuth, requireBotAccess] },
    async (req, reply) => {
      const { slug, pluginId } = req.params as any;
      const manifest = getPlugin(pluginId);
      if (!manifest) return reply.status(404).send({ error: 'Unknown plugin' });
      try {
        const creds = await resolveCreds(manifest, slug);
        reply.send({ baseUrl: creds.baseUrl ?? null });
      } catch (err: any) {
        reply.status(400).send({ error: err.message });
      }
    },
  );
}
