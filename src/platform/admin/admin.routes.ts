import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { requireAuth, requireAdmin } from '../auth/auth.middleware';

export default async function adminRoutes(app: FastifyInstance) {
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

  // DELETE /platform/admin/users/:id — soft deactivate
  app.delete('/platform/admin/users/:id', { preHandler: [requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as any;
    await prisma.user.update({ where: { id }, data: { active: false } });
    reply.status(204).send();
  });
}
