// src/platform/analytics/analytics.routes.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess } from '../auth/auth.middleware';

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get('/platform/bots/:slug/analytics', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
    const { slug } = req.params as any;
    const { period } = (req.query as any);
    const since = getPeriodStart(period ?? '7d');

    const [
      totalLeads,
      hotLeads,
      warmLeads,
      nurtureLeads,
      coldLeads,
      orderLeads,
      scoreAgg,
      totalInbound,
      totalOutbound,
    ] = await Promise.all([
      prisma.lead.count({ where: { companySlug: slug, createdAt: { gte: since } } }),
      prisma.lead.count({ where: { companySlug: slug, classification: 'hot', createdAt: { gte: since } } }),
      prisma.lead.count({ where: { companySlug: slug, classification: 'warm', createdAt: { gte: since } } }),
      prisma.lead.count({ where: { companySlug: slug, classification: 'nurture', createdAt: { gte: since } } }),
      prisma.lead.count({ where: { companySlug: slug, classification: 'cold', createdAt: { gte: since } } }),
      prisma.lead.count({ where: { companySlug: slug, classification: 'order', createdAt: { gte: since } } }),
      prisma.lead.aggregate({ where: { companySlug: slug, createdAt: { gte: since } }, _avg: { leadScore: true } }),
      prisma.conversation.count({ where: { companySlug: slug, direction: 'inbound', createdAt: { gte: since } } }),
      prisma.conversation.count({ where: { companySlug: slug, direction: 'outbound', createdAt: { gte: since } } }),
    ]);

    // Daily volume — aggregate in the database to avoid loading millions of rows
    const dailyRaw = await prisma.$queryRaw<{ day: string; direction: string; cnt: bigint }[]>`
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        direction,
        COUNT(*) AS cnt
      FROM conversations
      WHERE company_slug = ${slug}
        AND created_at >= ${since}
      GROUP BY day, direction
      ORDER BY day ASC
    `;

    const dailyMap = new Map<string, { date: string; inbound: number; outbound: number }>();
    for (const row of dailyRaw) {
      const entry = dailyMap.get(row.day) ?? { date: row.day, inbound: 0, outbound: 0 };
      if (row.direction === 'inbound') entry.inbound += Number(row.cnt);
      else entry.outbound += Number(row.cnt);
      dailyMap.set(row.day, entry);
    }
    const dailyVolume = Array.from(dailyMap.values());

    // Top sources
    const sourcesRaw = await prisma.lead.groupBy({
      by: ['source'],
      where: { companySlug: slug, createdAt: { gte: since } },
      _count: { source: true },
      orderBy: { _count: { source: 'desc' } },
      take: 10,
    });
    const topSources = sourcesRaw.map((r: { source: string | null; _count: { source: number } }) => ({ source: r.source ?? 'direct', count: r._count.source }));

    reply.send({
      stats: {
        totalLeads,
        byClassification: { hot: hotLeads, warm: warmLeads, nurture: nurtureLeads, cold: coldLeads, order: orderLeads },
        avgLeadScore: Math.round((scoreAgg._avg.leadScore ?? 0) * 10) / 10,
        totalConversations: totalInbound + totalOutbound,
        totalInbound,
        totalOutbound,
        dailyVolume,
        topSources,
      }
    });
  });
}
