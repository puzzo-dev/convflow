import crypto from 'crypto';
import { getCompanyBySessionId } from '../engine/tenant-router';
import { handleInbound } from '../engine/flow-engine';
function sanitizeSessionId(raw) {
    const s = String(raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!s)
        throw new Error('Invalid sessionId');
    return s;
}
function sanitizePhone(raw) {
    return String(raw ?? '').replace(/\D/g, '');
}
function sanitizeText(raw) {
    if (typeof raw !== 'string')
        return '';
    return raw.trim(); // downstream JSON-stringification keeps it in the request body
}
function sanitizeProfileName(raw) {
    if (typeof raw !== 'string')
        return null;
    return raw.trim();
}
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
        const sessionId = sanitizeSessionId(body.sessionId);
        const company = getCompanyBySessionId(sessionId);
        if (!company) {
            console.warn(`Unknown sessionId: ${sessionId}`);
            return;
        }
        const phone = sanitizePhone(body.data?.from);
        const text = sanitizeText(body.data?.body);
        const profileName = sanitizeProfileName(body.data?.contact?.pushName);
        await handleInbound(phone, text, profileName, company);
    }
    catch (err) {
        console.error('Webhook error:', err);
    }
}
