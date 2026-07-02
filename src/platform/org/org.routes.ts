import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { requireAuth } from '../auth/auth.middleware';
import { getPrimaryOrgId, rankOf, roleSatisfies } from '../auth/roles';

const ASSIGNABLE = ['owner', 'admin', 'member', 'viewer'];

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

  // Invite (add an existing user by email) to the caller's org.
  app.post('/platform/org/members', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const { email, role } = req.body as any;
    const ctx = await callerOrg(userId);
    if (!ctx) return reply.status(400).send({ error: 'You are not in an organization.' });
    if (!roleSatisfies(ctx.role, ['admin'])) return reply.status(403).send({ error: 'Only owners and admins can add members.' });
    if (!ASSIGNABLE.includes(role)) return reply.status(400).send({ error: 'Invalid role' });
    // Only an owner may grant the owner role.
    if (role === 'owner' && ctx.role !== 'owner') return reply.status(403).send({ error: 'Only an owner can assign the owner role.' });

    const invitee = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() }, select: { id: true } });
    if (!invitee) return reply.status(404).send({ error: 'No user with that email. Ask them to register first.' });

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
