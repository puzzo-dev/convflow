// src/platform/leads/lead.routes.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess } from '../auth/auth.middleware';

export default async function leadRoutes(app: FastifyInstance) {
  // Get leads for a bot
  app.get('/platform/bots/:slug/leads', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
    const { slug } = req.params as any;
    const query    = req.query as any;

    // Pagination params
    const page  = Math.max(1, parseInt(query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
    const skip  = (page - 1) * limit;

    // Optional classification filter (hot | warm | nurture | cold | order)
    const VALID_CLASSIFICATIONS = new Set(['hot', 'warm', 'nurture', 'cold', 'order']);
    const classification = query.classification && VALID_CLASSIFICATIONS.has(query.classification)
      ? query.classification
      : undefined;

    const where: Record<string, any> = { companySlug: slug };
    if (classification) {
      where.classification = classification;
    } else {
      // Default CRM view excludes completed orders — they have a dedicated
      // "Orders" filter and are counted separately in analytics.
      where.classification = { not: 'order' };
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.lead.count({ where }),
    ]);

    reply.send({
      leads,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });
}
