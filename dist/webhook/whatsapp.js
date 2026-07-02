import crypto from 'crypto';
import { getCompanyBySessionId } from '../engine/tenant-router';
import { handleInbound } from '../engine/flow-engine';
function verifyWebhookHMAC(req) {
    const secret = process.env.OPENWA_WEBHOOK_SECRET;
    if (!secret)
        return false;
    const rawBody = req.rawBody;
    const signature = req.headers['x-openwa-signature'] ?? '';
    if (!rawBody || !signature)
        return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (signature.length !== expected.length)
        return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }
    catch {
        return false;
    }
}
export async function whatsappWebhookPost(req, reply) {
    // Verify BEFORE acking so OpenWA retries on auth failure instead of silently dropping messages.
    if (!verifyWebhookHMAC(req)) {
        return reply.status(401).send({ error: 'Invalid or missing webhook signature' });
    }
    reply.send({ status: 'ok' });
    try {
        const body = req.body;
        if (body.event !== 'message.received')
            return;
        if (body.data?.isGroup)
            return;
        if (body.data?.type !== 'chat')
            return; // text only
        const company = getCompanyBySessionId(body.sessionId);
        if (!company) {
            console.warn(`Unknown sessionId: ${body.sessionId}`);
            return;
        }
        const phone = body.data.from.replace('@c.us', '');
        const text = body.data.body ?? '';
        const profileName = body.data.contact?.pushName ?? null;
        await handleInbound(phone, text, profileName, company);
    }
    catch (err) {
        console.error('Webhook error:', err);
    }
}
