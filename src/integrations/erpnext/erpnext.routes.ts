// src/integrations/erpnext/erpnext.routes.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { connectERPNext } from './erpnext.service';
import { syncItemsFromERPNext } from './item-sync.service';
import { requireAuth, requireBotAccess, requireBotRole } from '../../platform/auth/auth.middleware';

export default async function (app: FastifyInstance) {
  app.post('/platform/bots/:slug/erpnext/connect',
    { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] },
    async (req, reply) => {
      const { slug }                          = req.params as any;
      const { erpnextUrl, apiKey, apiSecret } = req.body as any;

      const tenant = await prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) return reply.status(404).send({ error: 'Bot not found' });

      try {
        await connectERPNext({
          companySlug: slug,
          sessionId:   tenant.openwaSessionId,
          openwaApiKey: process.env.OPENWA_API_KEY!,
          erpnextUrl,
          apiKey,
          apiSecret,
        });
        reply.send({ connected: true });
      } catch (err: any) {
        reply.status(400).send({ connected: false, error: err.message });
      }
    }
  );

  app.get('/platform/bots/:slug/erpnext/status',
    { preHandler: [requireAuth, requireBotAccess] },
    async (req, reply) => {
      const { slug } = req.params as any;
      const conn = await prisma.erpnextConnection.findUnique({ where: { companySlug: slug } });
      if (!conn) return reply.send({ connected: false });
      // NEVER expose apiKey / apiSecret to the browser — return only safe metadata.
      reply.send({
        connected:    conn.status === 'connected',
        erpnextUrl:   conn.erpnextUrl,
        status:       conn.status,
        connectedAt:  conn.connectedAt,
        lastSyncAt:   conn.lastSyncAt,
        errorMessage: conn.errorMessage,
      });
    }
  );

  app.delete('/platform/bots/:slug/erpnext/disconnect',
    { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] },
    async (req, reply) => {
      const { slug } = req.params as any;
      // updateMany never throws P2025 when the row is absent — it just affects 0 rows.
      await prisma.erpnextConnection.updateMany({
        where: { companySlug: slug },
        data:  { status: 'disconnected' },
      });
      reply.send({ disconnected: true });
    }
  );

  app.post('/platform/bots/:slug/erpnext/sync-items',
    { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] },
    async (req, reply) => {
      const { slug } = req.params as any;
      try {
        const count = await syncItemsFromERPNext(slug);
        reply.send({ synced: true, itemCount: count });
      } catch (err: any) {
        reply.status(400).send({ synced: false, error: err.message });
      }
    }
  );

  app.get('/platform/bots/:slug/erpnext/items',
    { preHandler: [requireAuth, requireBotAccess] },
    async (req, reply) => {
      const { slug }  = req.params as any;
      const { group } = req.query as any;

      const items = await prisma.erpnextItemCache.findMany({
        where: {
          companySlug: slug,
          isActive:    true,
          ...(group ? { itemGroup: group } : {}),
        },
        orderBy: { itemName: 'asc' },
        select: { itemCode: true, itemName: true, itemGroup: true, standardRate: true, currency: true },
      });
      reply.send({ items });
    }
  );
}
