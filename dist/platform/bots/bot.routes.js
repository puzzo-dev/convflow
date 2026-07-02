import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess, requireBotRole } from '../auth/auth.middleware';
import { refreshTenantCache } from '../../engine/tenant-router';
import axios from 'axios';
import crypto from 'crypto';
const openwaClient = () => axios.create({
    baseURL: process.env.OPENWA_BASE_URL ?? 'http://localhost:2785/api',
    headers: { 'X-API-Key': process.env.OPENWA_API_KEY ?? '' },
    timeout: 10_000,
});
export default async function botRoutes(app) {
    // GET /platform/bots
    app.get('/platform/bots', { preHandler: [requireAuth] }, async (req, reply) => {
        const user = req.user;
        let bots;
        if (user.role === 'super_admin') {
            bots = await prisma.tenant.findMany({
                select: { slug: true, name: true, openwaSessionId: true, active: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            });
        }
        else {
            const memberships = await prisma.tenantMembership.findMany({
                where: { userId: user.userId },
                include: { tenant: { select: { slug: true, name: true, openwaSessionId: true, active: true, createdAt: true } } },
                orderBy: { createdAt: 'desc' },
            });
            bots = memberships.map(m => m.tenant);
        }
        reply.send({ bots });
    });
    // POST /platform/bots
    app.post('/platform/bots', { preHandler: [requireAuth] }, async (req, reply) => {
        const user = req.user;
        const { name, websiteUrl, ownerPhone } = req.body;
        if (!name || !ownerPhone) {
            return reply.status(400).send({ error: 'name and ownerPhone are required' });
        }
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) {
            return reply.status(400).send({ error: 'Business name must contain alphanumeric characters' });
        }
        const sessionId = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
        const defaultConfig = {
            slug,
            name,
            openwaSessionId: sessionId,
            openwaApiKey: process.env.OPENWA_API_KEY ?? '',
            openwaBaseUrl: process.env.OPENWA_BASE_URL ?? 'http://localhost:2785/api',
            ownerPhone,
            websiteUrl: websiteUrl ?? '',
            flows: [
                {
                    stage: 0,
                    id: 'welcome',
                    type: 'free_text',
                    message: `👋 Hello {name}! Welcome to *${name}*. How can we help you today?`,
                    answerKey: 'enquiry',
                },
                {
                    stage: 1,
                    id: 'notify',
                    type: 'notify_only',
                    message: '',
                    terminal: {
                        type: 'notify_only',
                        successMessage: `Thanks for reaching out! Our team will be with you shortly 🙏`,
                    },
                },
            ],
            messages: {
                stop: `No problem! Come back anytime 👋`,
                escalate_confirm: `A team member will reach out to you directly 🙏`,
                human_takeover: `Hold on, let me get someone to help you with that 🙏`,
            },
        };
        const existing = await prisma.tenant.findUnique({ where: { slug } });
        if (existing) {
            return reply.status(409).send({ error: `A bot with slug "${slug}" already exists` });
        }
        const tenant = await prisma.tenant.create({
            data: { slug, name, openwaSessionId: sessionId, ownerPhone, configJson: defaultConfig, active: true },
        });
        // Grant the creating user owner-level access
        await prisma.tenantMembership.create({
            data: { userId: user.userId, tenantId: tenant.id, role: 'owner' },
        });
        try {
            await openwaClient().post('/sessions', { id: sessionId });
        }
        catch {
            // Non-blocking — QR ready after OpenWA initialises
        }
        await refreshTenantCache();
        reply.status(201).send({ bot: tenant, qrPollUrl: `/platform/bots/${slug}/qr` });
    });
    // GET /platform/bots/:slug
    app.get('/platform/bots/:slug', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const bot = await prisma.tenant.findUnique({
            where: { slug },
            select: { slug: true, name: true, openwaSessionId: true, active: true, createdAt: true },
        });
        if (!bot)
            return reply.status(404).send({ error: 'Bot not found' });
        reply.send({ bot });
    });
    // GET /platform/bots/:slug/qr
    app.get('/platform/bots/:slug/qr', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        try {
            const res = await openwaClient().get(`/sessions/${tenant.openwaSessionId}/qr`);
            const data = res.data;
            const qrImage = data.qrCode ?? data.qrImage ?? data.qr ?? data.base64 ?? null;
            reply.send({ status: data.status ?? 'STARTING', qrImage, phone: data.me?.user ?? null });
        }
        catch {
            reply.send({ status: 'STARTING', qrImage: null });
        }
    });
    // GET /platform/bots/:slug/status
    app.get('/platform/bots/:slug/status', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        try {
            const res = await openwaClient().get(`/sessions/${tenant.openwaSessionId}/status`);
            reply.send(res.data);
        }
        catch {
            reply.send({ status: 'UNKNOWN' });
        }
    });
    // POST /platform/bots/:slug/reconnect
    app.post('/platform/bots/:slug/reconnect', { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] }, async (req, reply) => {
        const { slug } = req.params;
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        if (!tenant)
            return reply.status(404).send({ error: 'Bot not found' });
        try {
            await openwaClient().post(`/sessions/${tenant.openwaSessionId}/restart`);
            reply.send({ restarted: true, qrPollUrl: `/platform/bots/${slug}/qr` });
        }
        catch (err) {
            reply.status(500).send({ error: 'Failed to restart session', detail: err.message });
        }
    });
}
