import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../store/prisma';
import { requireAuth, requireAdmin } from '../auth/auth.middleware';
import { hashPassword } from '../auth/auth.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    + '-' + crypto.randomBytes(2).toString('hex');
}

export default async function adminRoutes(app: FastifyInstance) {
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
