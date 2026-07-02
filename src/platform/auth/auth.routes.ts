import { FastifyInstance } from 'fastify';
import { prisma } from '../../store/prisma';
import crypto from 'crypto';
import { hashPassword, verifyPassword, generateToken } from './auth.service';
import { requireAuth } from './auth.middleware';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegisterBody(body: any): string | null {
  if (!body || typeof body !== 'object')                      return 'Request body is required';
  const name = body.name ?? body.businessName;
  if (typeof name !== 'string' || !name.trim())               return 'name is required';
  if (name.length > 120)                                      return 'name must be 120 characters or fewer';
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) return 'A valid email address is required';
  if (body.email.length > 200)                                return 'email must be 200 characters or fewer';
  if (typeof body.password !== 'string' || body.password.length < 8) return 'password must be at least 8 characters';
  if (Buffer.byteLength(body.password, 'utf8') > 72)          return 'password must not exceed 72 bytes';
  return null;
}

function validateLoginBody(body: any): string | null {
  if (!body || typeof body !== 'object')            return 'Request body is required';
  if (typeof body.email !== 'string' || !body.email) return 'email is required';
  if (typeof body.password !== 'string' || !body.password) return 'password is required';
  return null;
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/platform/auth/register', async (req, reply) => {
    const validationError = validateRegisterBody(req.body);
    if (validationError) return reply.status(400).send({ error: validationError });

    const body = req.body as any;
    const name = (body.name ?? body.businessName).trim();
    const email = body.email.toLowerCase();
    const { password } = body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(400).send({ error: 'Email already registered' });

    const passwordHash = await hashPassword(password);
    const apiKey = `cf_${crypto.randomBytes(30).toString('hex')}`;
    const orgSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
      + '-' + crypto.randomBytes(2).toString('hex');

    // A new signup creates a User AND their Organization, with the user as owner.
    const user = await prisma.user.create({
      data: {
        name, email, passwordHash, apiKey, role: 'member',
        orgMemberships: {
          create: {
            role: 'owner',
            org: { create: { name: `${name}'s Organization`, slug: orgSlug } },
          },
        },
      },
    });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    reply.send({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.post('/platform/auth/login', async (req, reply) => {
    const validationError = validateLoginBody(req.body);
    if (validationError) return reply.status(400).send({ error: validationError });

    const { email, password } = req.body as any;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return reply.status(401).send({ error: 'Invalid credentials' });

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return reply.status(401).send({ error: 'Invalid credentials' });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    reply.send({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.get('/platform/auth/me', { preHandler: [requireAuth] }, async (req, reply) => {
    const { userId } = (req as any).user;
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });
    reply.send({ user });
  });
}
