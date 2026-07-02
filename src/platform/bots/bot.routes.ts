import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess, requireBotRole } from '../auth/auth.middleware';
import { getPrimaryOrgId, roleSatisfies } from '../auth/roles';
import { refreshTenantCache } from '../../engine/tenant-router';
import axios from 'axios';
import crypto from 'crypto';
import { CompanyConfig } from '../../types';
import { OPENWA_BASE_URL, sanitizeSessionId } from '../../channels/openwa.channel';

const openwaClient = () => axios.create({
  baseURL: OPENWA_BASE_URL,
  headers: { 'X-API-Key': process.env.OPENWA_API_KEY ?? '' },
  timeout: 10_000,
});

export default async function botRoutes(app: FastifyInstance) {
  // GET /platform/bots
  app.get('/platform/bots', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;

    const select = { slug: true, name: true, openwaSessionId: true, active: true, createdAt: true } as const;

    let bots;
    if (user.role === 'super_admin') {
      bots = await prisma.tenant.findMany({ select, orderBy: { createdAt: 'desc' } });
    } else {
      // Hybrid visibility: every bot in the user's organizations, PLUS any bot
      // they have an explicit per-bot membership on.
      const [orgs, perBot] = await Promise.all([
        prisma.organizationMembership.findMany({ where: { userId: user.userId }, select: { orgId: true } }),
        prisma.tenantMembership.findMany({ where: { userId: user.userId }, select: { tenantId: true } }),
      ]);
      bots = await prisma.tenant.findMany({
        where: {
          OR: [
            { organizationId: { in: orgs.map(o => o.orgId) } },
            { id: { in: perBot.map(m => m.tenantId) } },
          ],
        },
        select,
        orderBy: { createdAt: 'desc' },
      });
    }

    reply.send({ bots });
  });

  // GET /platform/overview — aggregate stats across the caller's accessible bots
  app.get('/platform/overview', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;

    let bots: { slug: string; active: boolean }[];
    if (user.role === 'super_admin') {
      bots = await prisma.tenant.findMany({ select: { slug: true, active: true } });
    } else {
      const [orgs, perBot] = await Promise.all([
        prisma.organizationMembership.findMany({ where: { userId: user.userId }, select: { orgId: true } }),
        prisma.tenantMembership.findMany({ where: { userId: user.userId }, select: { tenantId: true } }),
      ]);
      bots = await prisma.tenant.findMany({
        where: {
          OR: [
            { organizationId: { in: orgs.map(o => o.orgId) } },
            { id: { in: perBot.map(m => m.tenantId) } },
          ],
        },
        select: { slug: true, active: true },
      });
    }

    const slugs = bots.map(b => b.slug);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalLeads, hotLeads, orders, totalConversations, recentInbound, byClassRaw] = await Promise.all([
      prisma.lead.count({ where: { companySlug: { in: slugs } } }),
      prisma.lead.count({ where: { companySlug: { in: slugs }, classification: 'hot' } }),
      prisma.lead.count({ where: { companySlug: { in: slugs }, classification: 'order' } }),
      prisma.conversation.count({ where: { companySlug: { in: slugs } } }),
      prisma.conversation.count({ where: { companySlug: { in: slugs }, direction: 'inbound', createdAt: { gte: since } } }),
      prisma.lead.groupBy({ by: ['classification'], where: { companySlug: { in: slugs } }, _count: { _all: true } }),
    ]);

    const byClassification: Record<string, number> = {};
    for (const r of byClassRaw) byClassification[r.classification ?? 'unknown'] = r._count._all;

    reply.send({
      stats: {
        botCount: bots.length,
        activeBots: bots.filter(b => b.active).length,
        totalLeads, hotLeads, orders, totalConversations,
        recentInbound7d: recentInbound,
        byClassification,
      },
    });
  });

  // POST /platform/bots
  app.post('/platform/bots', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = (req as any).user;
    const { name, websiteUrl, ownerPhone, organizationId } = req.body as any;

    if (!name || !ownerPhone) {
      return reply.status(400).send({ error: 'name and ownerPhone are required' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) {
      return reply.status(400).send({ error: 'Business name must contain alphanumeric characters' });
    }
    const sessionId = `${slug}-${crypto.randomBytes(3).toString('hex')}`;

    const defaultConfig: CompanyConfig = {
      slug,
      name,
      openwaSessionId: sessionId,
      openwaApiKey:    process.env.OPENWA_API_KEY ?? '',
      openwaBaseUrl:   process.env.OPENWA_BASE_URL ?? 'http://localhost:2785/api',
      ownerPhone,
      websiteUrl:      websiteUrl ?? '',
      flows: [
        {
          stage: 0,
          id:    'welcome',
          type:  'free_text',
          message: `👋 Hello {name}! Welcome to *${name}*. How can we help you today?`,
          answerKey: 'enquiry',
        },
        {
          stage: 1,
          id:    'notify',
          type:  'notify_only',
          message: '',
          terminal: {
            type: 'notify_only',
            successMessage: `Thanks for reaching out! Our team will be with you shortly 🙏`,
          },
        },
      ],
      messages: {
        stop:             `No problem! Come back anytime 👋`,
        escalate_confirm: `A team member will reach out to you directly 🙏`,
        human_takeover:   `Hold on, let me get someone to help you with that 🙏`,
      },
    };

    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      return reply.status(409).send({ error: `A bot with slug "${slug}" already exists` });
    }

    // Resolve the owning organization. A super admin may explicitly assign the
    // bot to ANY organization; everyone else creates under their own primary org.
    let orgId: string | null;
    if (user.role === 'super_admin' && organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!org) return reply.status(400).send({ error: 'Selected organization not found.' });
      orgId = org.id;
    } else {
      orgId = await getPrimaryOrgId(user.userId);
    }
    if (!orgId) {
      return reply.status(400).send({
        error: user.role === 'super_admin'
          ? 'Select an organization to assign this bot to.'
          : 'You must belong to an organization to create a bot.',
      });
    }

    // Only org owners/admins may create bots (super admins bypass this).
    if (user.role !== 'super_admin') {
      const m = await prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: user.userId, orgId } }, select: { role: true },
      });
      if (!roleSatisfies(m?.role ?? null, ['admin'])) {
        return reply.status(403).send({ error: 'Only organization owners and admins can create bots.' });
      }
    }

    const tenant = await prisma.tenant.create({
      data: {
        slug, name, openwaSessionId: sessionId, ownerPhone,
        configJson: defaultConfig as object, active: true, organizationId: orgId,
      },
    });

    // Grant an explicit per-bot owner membership (used by owner-alert lookups).
    // When a super admin creates for another org, the org's owner becomes the
    // bot owner so alerts route to a real user; otherwise the creator.
    let ownerUserId = user.userId;
    if (user.role === 'super_admin') {
      const orgOwner = await prisma.organizationMembership.findFirst({
        where: { orgId, role: 'owner' }, select: { userId: true },
      });
      if (orgOwner) ownerUserId = orgOwner.userId;
    }
    await prisma.tenantMembership.create({
      data: { userId: ownerUserId, tenantId: tenant.id, role: 'owner' },
    });

    try {
      await openwaClient().post('/sessions', { id: sessionId });
    } catch {
      // Non-blocking — QR ready after OpenWA initialises
    }

    await refreshTenantCache();

    reply.status(201).send({ bot: tenant, qrPollUrl: `/platform/bots/${slug}/qr` });
  });

  // GET /platform/bots/:slug
  app.get('/platform/bots/:slug', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
    const { slug } = req.params as any;
    const bot = await prisma.tenant.findUnique({
      where:  { slug },
      select: { slug: true, name: true, openwaSessionId: true, active: true, createdAt: true },
    });
    if (!bot) return reply.status(404).send({ error: 'Bot not found' });
    reply.send({ bot });
  });

  // GET /platform/bots/:slug/qr
  app.get('/platform/bots/:slug/qr', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
    const { slug } = req.params as any;
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return reply.status(404).send({ error: 'Bot not found' });

    try {
      const sessionId = sanitizeSessionId(tenant.openwaSessionId);
      const res = await openwaClient().get(`/sessions/${sessionId}/qr`);
      const data = res.data as any;
      const qrImage = data.qrCode ?? data.qrImage ?? data.qr ?? data.base64 ?? null;
      reply.send({ status: data.status ?? 'STARTING', qrImage, phone: data.me?.user ?? null });
    } catch {
      reply.send({ status: 'STARTING', qrImage: null });
    }
  });

  // POST /platform/bots/:slug/reconnect
  app.post('/platform/bots/:slug/reconnect', { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] }, async (req, reply) => {
    const { slug } = req.params as any;
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return reply.status(404).send({ error: 'Bot not found' });

    try {
      const sessionId = sanitizeSessionId(tenant.openwaSessionId);
      await openwaClient().post(`/sessions/${sessionId}/restart`);
      reply.send({ restarted: true, qrPollUrl: `/platform/bots/${slug}/qr` });
    } catch (err: any) {
      reply.status(500).send({ error: 'Failed to restart session', detail: err.message });
    }
  });
}
