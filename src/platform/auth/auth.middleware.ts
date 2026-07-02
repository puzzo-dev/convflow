import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './auth.service';
import { prisma } from '../../store/prisma';
import { getEffectiveBotRole, roleSatisfies } from './roles';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = verifyToken(authHeader.substring(7));
    // Reconcile token claims with the current DB state so revoked/deactivated users are locked out immediately.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, active: true },
    });
    if (!user || !user.active) {
      return reply.status(401).send({ error: 'Account disabled or removed' });
    }
    (req as any).user = { ...payload, role: user.role, active: user.active };
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
}

export async function requireBotAccess(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user;
  if (!user) return reply.status(401).send({ error: 'Unauthorized' });

  const { slug } = req.params as any;
  if (!slug) return reply.status(400).send({ error: 'Missing bot slug parameter' });

  if (user.role === 'super_admin') { (req as any).botRole = 'owner'; return; }

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, organizationId: true } });
  if (!tenant) return reply.status(404).send({ error: 'Bot not found' });

  // Hybrid: org-wide role OR per-bot role (whichever is higher).
  const botRole = await getEffectiveBotRole(user.userId, tenant);
  if (!botRole) {
    return reply.status(403).send({ error: 'Forbidden: You do not have access to this bot.' });
  }

  (req as any).botRole = botRole;
}

export function requireBotRole(allowedRoles: string[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const { slug } = req.params as any;
    if (!slug) return reply.status(400).send({ error: 'Missing bot slug parameter' });

    if (user.role === 'super_admin') { (req as any).botRole = 'owner'; return; }

    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, organizationId: true } });
    if (!tenant) return reply.status(404).send({ error: 'Bot not found' });

    const botRole = await getEffectiveBotRole(user.userId, tenant);
    if (!roleSatisfies(botRole, allowedRoles)) {
      return reply.status(403).send({ error: 'Forbidden: insufficient bot role.' });
    }

    (req as any).botRole = botRole;
  };
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user;
  if (!user) return reply.status(401).send({ error: 'Unauthorized' });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { role: true, active: true },
  });

  if (!dbUser || !dbUser.active || dbUser.role !== 'super_admin') {
    return reply.status(403).send({ error: 'Forbidden: Super Admin only' });
  }

  (req as any).user = { ...user, role: dbUser.role };
}
