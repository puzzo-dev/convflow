import { prisma } from '../../store/prisma';
import { requireAuth, requireBotAccess, requireBotRole } from '../auth/auth.middleware';
import { getState, setState } from '../../store/redis';
import { sendMessage } from '../../channels/openwa.channel';
const PHONE_RE = /^\d{7,15}$/;
function normalizePhone(raw) {
    return (raw ?? '').replace(/\D/g, '');
}
export default async function conversationRoutes(app) {
    // ─────────────────────────────────────────────────────────────────────────────
    // GET /platform/bots/:slug/conversations — recent phones + optional human-mode filter
    // ─────────────────────────────────────────────────────────────────────────────
    app.get('/platform/bots/:slug/conversations', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug } = req.params;
        const recentPhones = await prisma.conversation.findMany({
            where: { companySlug: slug },
            distinct: ['phone'],
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { phone: true },
        });
        reply.send({ phones: recentPhones.map((r) => r.phone) });
    });
    // ─────────────────────────────────────────────────────────────────────────────
    // GET /platform/bots/:slug/conversations/:phone — full thread for one number
    // ─────────────────────────────────────────────────────────────────────────────
    app.get('/platform/bots/:slug/conversations/:phone', { preHandler: [requireAuth, requireBotAccess] }, async (req, reply) => {
        const { slug, phone } = req.params;
        const [rawThread, activeTakeover] = await Promise.all([
            prisma.conversation.findMany({
                where: { companySlug: slug, phone },
                orderBy: { createdAt: 'asc' },
                take: 200,
            }),
            prisma.humanTakeover.findFirst({
                where: { companySlug: slug, phone, resumedAt: null },
                orderBy: { triggeredAt: 'desc' },
            }),
        ]);
        // Expose messageText as 'message' so the frontend API contract is consistent
        const thread = rawThread.map((r) => ({
            id: r.id,
            phone: r.phone,
            direction: r.direction,
            message: r.messageText,
            stageId: r.stageId,
            createdAt: r.createdAt,
        }));
        reply.send({
            phone,
            thread,
            humanMode: !!activeTakeover,
            takeover: activeTakeover ?? null,
        });
    });
    // ─────────────────────────────────────────────────────────────────────────────
    // POST /platform/bots/:slug/conversations/:phone/resume
    // Agent clicks "Resume Bot" in dashboard → flips Redis state back to 'bot'
    // and re-sends the last bot prompt to the customer
    // ─────────────────────────────────────────────────────────────────────────────
    app.post('/platform/bots/:slug/conversations/:phone/resume', { preHandler: [requireAuth, requireBotRole(['owner', 'admin'])] }, async (req, reply) => {
        const { slug } = req.params;
        const phone = normalizePhone(req.params.phone);
        if (!PHONE_RE.test(phone)) {
            return reply.status(400).send({ error: 'Invalid phone number' });
        }
        // Mark takeover as resolved in DB
        const takeover = await prisma.humanTakeover.findFirst({
            where: { companySlug: slug, phone, resumedAt: null },
            orderBy: { triggeredAt: 'desc' },
        });
        if (takeover) {
            await prisma.humanTakeover.update({
                where: { id: takeover.id },
                data: { resumedAt: new Date(), resumedBy: req.user.email },
            });
        }
        // Flip Redis state back to 'bot'
        const state = await getState(phone, slug);
        if (state && state.mode === 'human') {
            state.mode = 'bot';
            await setState(phone, slug, state);
            // Re-send the current stage prompt to the customer so they know the bot resumed
            const tenant = await prisma.tenant.findUnique({ where: { slug } });
            if (tenant) {
                const config = tenant.configJson;
                const currentStage = config.flows[state.stage];
                if (currentStage) {
                    await sendMessage(config, phone, currentStage.message);
                }
            }
        }
        reply.send({ success: true, resumed: true });
    });
}
