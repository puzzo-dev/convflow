// Exposes: POST /api/openwa-proxy/:sessionId/messages
// frappe_whatsapp posts here → ConvFlow forwards to OpenWA

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { sendMessage } from '../channels/openwa.channel';
import { getCompanyBySessionId } from '../engine/tenant-router';

export default async function openwaProxyRoutes(app: FastifyInstance) {
  // Auth: ERPNext must send the webhook_secret configured in WhatsApp Settings
  app.post('/api/openwa-proxy/:sessionId/messages', async (req, reply) => {
    const { sessionId } = req.params as any;
    const body          = req.body as any;

    const company = getCompanyBySessionId(sessionId);
    if (!company) return reply.status(404).send({ error: 'Session not found' });

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

    const phone = (body.to as string)?.replace(/\D/g, '');
    const text  = body.message ?? body.text;

    if (!phone || !text) return reply.status(400).send({ error: 'Missing to or message' });

    await sendMessage(company, phone, text);
    reply.send({ success: true });
  });
}
