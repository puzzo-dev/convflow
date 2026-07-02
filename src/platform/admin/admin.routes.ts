import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../store/prisma';
import { requireAuth, requireAdmin } from '../auth/auth.middleware';
import { hashPassword } from '../auth/auth.service';
import { getActiveSessions } from '../../store/redis';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    + '-' + crypto.randomBytes(2).toString('hex');
}

export default async function adminRoutes(app: FastifyInstance) {
  // GET /platform/admin/analytics — system-wide stats, live activity, charts
  app.get('/platform/admin/analytics', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLeads, totalOrders, hotLeads, totalConversations,
      orgCount, botCount, activeBotRows, userCount,
      byClassRaw, active,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { classification: 'order' } }),
      prisma.lead.count({ where: { classification: 'hot' } }),
      prisma.conversation.count(),
      prisma.organization.count(),
      prisma.tenant.count(),
      prisma.tenant.findMany({ where: { active: true }, select: { slug: true } }),
      prisma.user.count(),
      prisma.lead.groupBy({ by: ['classification'], _count: { _all: true } }),
      getActiveSessions().catch(() => ({ total: 0, byCompany: {} as Record<string, number> })),
    ]);

    const byClassification: Record<string, number> = {};
    for (const r of byClassRaw) byClassification[r.classification ?? 'unknown'] = r._count._all;

    // Daily volume for the last 30 days (leads + conversations), aggregated in DB.
    const leadsDaily = await prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
      SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS cnt
      FROM leads WHERE created_at >= ${since} GROUP BY day ORDER BY day ASC`;
    const convDaily = await prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
      SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS cnt
      FROM conversations WHERE created_at >= ${since} GROUP BY day ORDER BY day ASC`;

    const dayMap: Record<string, { date: string; leads: number; conversations: number }> = {};
    for (const r of leadsDaily) (dayMap[r.day] ??= { date: r.day, leads: 0, conversations: 0 }).leads = Number(r.cnt);
    for (const r of convDaily)  (dayMap[r.day] ??= { date: r.day, leads: 0, conversations: 0 }).conversations = Number(r.cnt);
    const dailyVolume = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

    // Top bots by lead count.
    const topRaw = await prisma.lead.groupBy({
      by: ['companySlug'], _count: { _all: true },
      orderBy: { _count: { companySlug: 'desc' } }, take: 8,
    });
    const nameMap = Object.fromEntries(
      (await prisma.tenant.findMany({ select: { slug: true, name: true } })).map(t => [t.slug, t.name]),
    );
    const topBots = topRaw.map(r => ({ slug: r.companySlug, name: nameMap[r.companySlug] ?? r.companySlug, leads: r._count._all }));

    // A bot is "live" if it has at least one active conversation session right now.
    const liveBotSlugs = Object.keys(active.byCompany);

    reply.send({
      stats: {
        orgCount, userCount, botCount, activeBots: activeBotRows.length,
        totalLeads, totalOrders, hotLeads, totalConversations,
        activeCustomers: active.total,          // customers currently mid-conversation
        liveBots: liveBotSlugs.length,          // bots with a customer active right now
        byClassification,
      },
      dailyVolume,
      topBots,
      liveByBot: liveBotSlugs.map(slug => ({ slug, name: nameMap[slug] ?? slug, active: active.byCompany[slug] }))
                   .sort((a, b) => b.active - a.active),
    });
  });

  // POST /platform/admin/users — create a user account
  app.post('/platform/admin/users', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { name, email, password, role } = req.body as any;
    if (typeof name !== 'string' || !name.trim())        return reply.status(400).send({ error: 'name is required' });
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) return reply.status(400).send({ error: 'A valid email is required' });
    if (typeof password !== 'string' || password.length < 8) return reply.status(400).send({ error: 'password must be at least 8 characters' });
    if (Buffer.byteLength(password, 'utf8') > 72)        return reply.status(400).send({ error: 'password must not exceed 72 bytes' });
    const platformRole = role === 'super_admin' ? 'super_admin' : 'member';

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return reply.status(400).send({ error: 'Email already registered' });

    const user = await prisma.user.create({
      data: {
        name: name.trim(), email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        apiKey: `cf_${crypto.randomBytes(30).toString('hex')}`,
        role: platformRole,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    reply.status(201).send({ user });
  });

  // POST /platform/admin/organizations — create an org, optionally with an owner
  app.post('/platform/admin/organizations', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { name, ownerEmail } = req.body as any;
    if (typeof name !== 'string' || !name.trim()) return reply.status(400).send({ error: 'name is required' });

    let ownerId: string | null = null;
    if (ownerEmail) {
      const owner = await prisma.user.findUnique({ where: { email: String(ownerEmail).toLowerCase() }, select: { id: true } });
      if (!owner) return reply.status(404).send({ error: 'No user with that owner email. Create the user first.' });
      ownerId = owner.id;
    }

    const org = await prisma.organization.create({
      data: {
        name: name.trim(), slug: slugify(name),
        ...(ownerId ? { memberships: { create: { userId: ownerId, role: 'owner' } } } : {}),
      },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    reply.status(201).send({ organization: org });
  });

  // GET /platform/admin/users — all users with their bot count
  app.get('/platform/admin/users', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        active:    true,
        createdAt: true,
        _count: { select: { orgMemberships: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ users });
  });

  // GET /platform/admin/organizations — every tenant/business with counts
  app.get('/platform/admin/organizations', { preHandler: [requireAuth, requireAdmin] }, async (_req, reply) => {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true, name: true, slug: true, createdAt: true,
        _count: { select: { memberships: true, bots: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    reply.send({ organizations: orgs });
  });

  // PATCH /platform/admin/users/:id/role — promote/demote
  app.patch('/platform/admin/users/:id/role', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id }   = req.params as any;
    const { role } = req.body as any;

    if (!['member', 'super_admin'].includes(role)) {
      return reply.status(400).send({ error: 'role must be member or super_admin' });
    }

    const user = await prisma.user.update({ where: { id }, data: { role } });
    reply.send({ user: { id: user.id, email: user.email, role: user.role } });
  });

  // PATCH /platform/admin/users/:id — edit name and/or active status
  app.patch('/platform/admin/users/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as any;
    const b = req.body as any;
    const data: any = {};
    if (b.name !== undefined) {
      if (typeof b.name !== 'string' || !b.name.trim()) return reply.status(400).send({ error: 'name must be a non-empty string' });
      if (b.name.length > 120) return reply.status(400).send({ error: 'name must be 120 characters or fewer' });
      data.name = b.name.trim();
    }
    if (b.active !== undefined) data.active = !!b.active;
    if (Object.keys(data).length === 0) return reply.status(400).send({ error: 'Nothing to update' });

    const user = await prisma.user.update({ where: { id }, data });
    reply.send({ user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
  });

  // DELETE /platform/admin/users/:id — soft deactivate
  app.delete('/platform/admin/users/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as any;
    await prisma.user.update({ where: { id }, data: { active: false } });
    reply.status(204).send();
  });

  // PATCH /platform/admin/organizations/:id — rename any organization
  app.patch('/platform/admin/organizations/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id }   = req.params as any;
    const { name } = req.body as any;
    if (typeof name !== 'string' || !name.trim()) return reply.status(400).send({ error: 'name is required' });
    if (name.length > 120) return reply.status(400).send({ error: 'name must be 120 characters or fewer' });
    const org = await prisma.organization.update({ where: { id }, data: { name: name.trim() } });
    reply.send({ organization: { id: org.id, name: org.name, slug: org.slug } });
  });
}
