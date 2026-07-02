// Exposes: POST /api/openwa-proxy/:sessionId/messages
// frappe_whatsapp posts here → ConvFlow forwards to OpenWA

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { sendMessage, sanitizeSessionId, validateOpenwaUrl } from '../channels/openwa.channel';
import { getCompanyBySessionId } from '../engine/tenant-router';

export default async function openwaProxyRoutes(app: FastifyInstance) {
  // Auth: ERPNext must send the webhook_secret configured in WhatsApp Settings
  app.post('/api/openwa-proxy/:sessionId/messages', async (req, reply) => {
    const { sessionId } = req.params as any;
    const body          = req.body as any;

    let safeSessionId: string;
    try {
      safeSessionId = sanitizeSessionId(sessionId);
    } catch {
      return reply.status(400).send({ error: 'Invalid session id' });
    }

    const company = getCompanyBySessionId(safeSessionId);
    if (!company) return reply.status(404).send({ error: 'Session not found' });

    try {
      validateOpenwaUrl(company.openwaBaseUrl);
    } catch {
      return reply.status(500).send({ error: 'Invalid OpenWA base URL configured for this bot' });
    }

    const expectedSecret = company.erpnextProxySecret;
    if (!expectedSecret) {
      return reply.status(403).send({ error: 'Webhook secret not configured for this bot' });
    }

    const providedSecret = (req.headers['x-webhook-secret'] as string) ?? '';
    if (
      providedSecret.length !== expectedSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(expectedSecret))
    ) {
      return reply.status(401).send({ error: 'Invalid webhook secret' });
    }

    const rawPhone = typeof body.to === 'string' ? body.to : '';
    const phone    = rawPhone.replace(/\D/g, '');
    const text     = (typeof body.message === 'string' && body.message) ||
                     (typeof body.text === 'string' && body.text) || '';

    if (!phone || !text) return reply.status(400).send({ error: 'Missing to or message' });

    await sendMessage(company, phone, text);
    reply.send({ success: true });
  });
}
