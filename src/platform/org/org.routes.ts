import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../store/prisma';
import { requireAuth } from '../auth/auth.middleware';
import { getPrimaryOrgId, rankOf, roleSatisfies } from '../auth/roles';
import { hashPassword } from '../auth/auth.service';

const ASSIGNABLE = ['owner', 'admin', 'member', 'viewer'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolve the caller's primary org + their role in it.
async function callerOrg(userId: string): Promise<{ orgId: string; role: string } | null> {
  const orgId = await getPrimaryOrgId(userId);
  if (!orgId) return null;
  const m = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId, orgId } }, select: { role: true },
  });
  return m ? { orgId, role: m.role } : null;
}

export default async function orgRoutes(app: FastifyInstance) {
  // Current org + the caller's role in it.
  app.get('/platform/org', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.send({ org: null, role: null });
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId }, select: { id: true, name: true, slug: true },
    });
    reply.send({ org, role: ctx.role });
  });

  // Rename the caller's org (owners and admins).
  app.patch('/platform/org', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { name }   = req.body as any;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.status(400).send({ error: 'You are not in an organization.' });
    if (!roleSatisfies(ctx.role, ['admin'])) return reply.status(403).send({ error: 'Only owners and admins can rename the organization.' });
    if (typeof name !== 'string' || !name.trim()) return reply.status(400).send({ error: 'name is required' });
    if (name.length > 120) return reply.status(400).send({ error: 'name must be 120 characters or fewer' });

    const org = await prisma.organization.update({ where: { id: ctx.orgId }, data: { name: name.trim() } });
    reply.send({ org: { id: org.id, name: org.name, slug: org.slug } });
  });

  // Members of the caller's org.
  app.get('/platform/org/members', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.send({ members: [], role: null });

    const rows = await prisma.organizationMembership.findMany({
      where:   { orgId: ctx.orgId },
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const members = rows.map(r => ({
      userId: r.userId, name: r.user.name, email: r.user.email,
      active: r.user.active, role: r.role, isYou: r.userId === userId,
    }));
    reply.send({ members, role: ctx.role });
  });

  // Add a member to the caller's org. If the email has no account yet and
  // name+password are supplied, a new user is created (tenant-level provisioning).
  app.post('/platform/org/members', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { email, role, name, password } = req.body as any;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.status(400).send({ error: 'You are not in an organization.' });
    if (!roleSatisfies(ctx.role, ['admin'])) return reply.status(403).send({ error: 'Only owners and admins can add members.' });
    if (!ASSIGNABLE.includes(role)) return reply.status(400).send({ error: 'Invalid role' });
    if (role === 'owner' && ctx.role !== 'owner') return reply.status(403).send({ error: 'Only an owner can assign the owner role.' });
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) return reply.status(400).send({ error: 'A valid email is required' });

    let invitee = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });

    // Create the account if it doesn't exist and credentials were provided.
    if (!invitee) {
      if (!name || !password) {
        return reply.status(404).send({ error: 'No user with that email. Provide a name and password to create their account.' });
      }
      if (String(password).length < 8) return reply.status(400).send({ error: 'password must be at least 8 characters' });
      invitee = await prisma.user.create({
        data: {
          name: String(name).trim(), email: email.toLowerCase(),
          passwordHash: await hashPassword(String(password)),
          apiKey: `cf_${crypto.randomBytes(30).toString('hex')}`,
          role: 'member',
        },
        select: { id: true },
      });
    }

    await prisma.organizationMembership.upsert({
      where:  { userId_orgId: { userId: invitee.id, orgId: ctx.orgId } },
      update: { role },
      create: { userId: invitee.id, orgId: ctx.orgId, role },
    });
    reply.status(201).send({ ok: true });
  });

  // Change a member's role.
  app.patch('/platform/org/members/:memberId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { memberId } = req.params as any;
    const { role } = req.body as any;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.status(400).send({ error: 'You are not in an organization.' });
    if (!roleSatisfies(ctx.role, ['admin'])) return reply.status(403).send({ error: 'Only owners and admins can change roles.' });
    if (!ASSIGNABLE.includes(role)) return reply.status(400).send({ error: 'Invalid role' });
    if (memberId === userId) return reply.status(400).send({ error: 'You cannot change your own role.' });
    if (role === 'owner' && ctx.role !== 'owner') return reply.status(403).send({ error: 'Only an owner can assign the owner role.' });

    const target = await prisma.organizationMembership.findUnique({ where: { userId_orgId: { userId: memberId, orgId: ctx.orgId } } });
    if (!target) return reply.status(404).send({ error: 'Member not found' });
    // Admins cannot modify owners.
    if (rankOf(target.role) >= rankOf('owner') && ctx.role !== 'owner') {
      return reply.status(403).send({ error: 'Only an owner can modify another owner.' });
    }
    // Never leave the org without an owner.
    if (target.role === 'owner' && role !== 'owner') {
      const owners = await prisma.organizationMembership.count({ where: { orgId: ctx.orgId, role: 'owner' } });
      if (owners <= 1) return reply.status(400).send({ error: 'The organization must have at least one owner.' });
    }

    await prisma.organizationMembership.update({
      where: { userId_orgId: { userId: memberId, orgId: ctx.orgId } }, data: { role },
    });
    reply.send({ ok: true });
  });

  // Remove a member from the org.
  app.delete('/platform/org/members/:memberId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { memberId } = req.params as any;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.status(400).send({ error: 'You are not in an organization.' });
    if (!roleSatisfies(ctx.role, ['admin'])) return reply.status(403).send({ error: 'Only owners and admins can remove members.' });
    if (memberId === userId) return reply.status(400).send({ error: 'You cannot remove yourself.' });

    const target = await prisma.organizationMembership.findUnique({ where: { userId_orgId: { userId: memberId, orgId: ctx.orgId } } });
    if (!target) return reply.status(404).send({ error: 'Member not found' });
    if (rankOf(target.role) >= rankOf('owner') && ctx.role !== 'owner') {
      return reply.status(403).send({ error: 'Only an owner can remove another owner.' });
    }
    if (target.role === 'owner') {
      const owners = await prisma.organizationMembership.count({ where: { orgId: ctx.orgId, role: 'owner' } });
      if (owners <= 1) return reply.status(400).send({ error: 'The organization must have at least one owner.' });
    }

    await prisma.organizationMembership.delete({ where: { userId_orgId: { userId: memberId, orgId: ctx.orgId } } });
    reply.status(204).send();
  });
}
