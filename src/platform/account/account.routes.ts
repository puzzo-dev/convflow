import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import { requireAuth } from '../auth/auth.middleware';
import crypto from 'crypto';

export default async function accountRoutes(app: FastifyInstance) {
  app.get('/platform/account', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });
    reply.send({ user });
  });

  app.post('/platform/account/api-key/rotate', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const newKey = `cf_${crypto.randomBytes(30).toString('hex')}`;

    await prisma.user.update({
      where: { id: userId },
      data:  { apiKey: newKey },
    });

    reply.send({ apiKey: newKey });
  });
}
