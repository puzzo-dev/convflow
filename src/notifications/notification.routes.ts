import { FastifyInstance } from 'fastify';
import { prisma } from '../store/prisma';
import { requireAuth } from '../platform/auth/auth.middleware';
import { encryptJson } from './crypto';
import { testChannel } from './notify.service';
import { PROVIDER_FIELDS, PROVIDERS_BY_KIND, ChannelKind, Provider } from './channels/types';

const VALID_KINDS: ChannelKind[] = ['email', 'whatsapp', 'sms'];

function validProviderForKind(kind: ChannelKind, provider: Provider): boolean {
  return (PROVIDERS_BY_KIND[kind] ?? []).includes(provider);
}

export default async function notificationRoutes(app: FastifyInstance) {
  // Metadata for the settings UI: which providers + credential fields exist.
  app.get('/platform/notifications/providers', { preHandler: [requireAuth] }, async (_req, reply) => {
    reply.send({ providersByKind: PROVIDERS_BY_KIND, providerFields: PROVIDER_FIELDS });
  });

  // List the user's channels — never returns credential values.
  app.get('/platform/notifications/channels', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const rows = await prisma.notificationChannel.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, kind: true, provider: true, label: true, target: true, enabled: true, createdAt: true },
    });
    reply.send({ channels: rows });
  });

  // Create a channel — credentials are encrypted before storage.
  app.post('/platform/notifications/channels', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const b = req.body as any;

    if (!VALID_KINDS.includes(b.kind))                 return reply.status(400).send({ error: 'Invalid channel kind' });
    if (!validProviderForKind(b.kind, b.provider))     return reply.status(400).send({ error: `Provider "${b.provider}" not valid for ${b.kind}` });
    if (!b.credentials || typeof b.credentials !== 'object') return reply.status(400).send({ error: 'credentials object is required' });

    const channel = await prisma.notificationChannel.create({
      data: {
        userId,
        kind:        b.kind,
        provider:    b.provider,
        label:       b.label ?? null,
        target:      b.target ?? null,
        enabled:     b.enabled ?? true,
        credentials: encryptJson(b.credentials),
      },
      select: { id: true, kind: true, provider: true, label: true, target: true, enabled: true, createdAt: true },
    });
    reply.status(201).send({ channel });
  });

  // Update label / target / enabled, and optionally rotate credentials.
  app.put('/platform/notifications/channels/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { id }     = req.params as any;
    const b          = req.body as any;

    const existing = await prisma.notificationChannel.findFirst({ where: { id, userId } });
    if (!existing) return reply.status(404).send({ error: 'Channel not found' });

    const data: any = {};
    if (b.label   !== undefined) data.label   = b.label;
    if (b.target  !== undefined) data.target  = b.target;
    if (b.enabled !== undefined) data.enabled = b.enabled;
    if (b.credentials && typeof b.credentials === 'object') data.credentials = encryptJson(b.credentials);

    const channel = await prisma.notificationChannel.update({
      where:  { id },
      data,
      select: { id: true, kind: true, provider: true, label: true, target: true, enabled: true, createdAt: true },
    });
    reply.send({ channel });
  });

  // Delete a channel.
  app.delete('/platform/notifications/channels/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { id }     = req.params as any;
    const existing = await prisma.notificationChannel.findFirst({ where: { id, userId } });
    if (!existing) return reply.status(404).send({ error: 'Channel not found' });
    await prisma.notificationChannel.delete({ where: { id } });
    reply.status(204).send();
  });

  // Fire a test notification through one channel.
  app.post('/platform/notifications/channels/:id/test', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { id }     = req.params as any;
    const result = await testChannel(id, userId);
    reply.send(result);
  });
}
