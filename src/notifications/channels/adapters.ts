import nodemailer from 'nodemailer';
import { ChannelAdapter, Provider, SendResult } from './types';

// ── SMTP (email) ──────────────────────────────────────────────────────────────
const smtpAdapter: ChannelAdapter = {
  kind: 'email',
  provider: 'smtp',
  async send(creds, target, message, subject): Promise<SendResult> {
    try {
      const port = Number(creds.port) || 587;
      const transport = nodemailer.createTransport({
        host: creds.host,
        port,
        secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: { user: creds.user, pass: creds.pass },
      });
      await transport.sendMail({
        from: creds.from || creds.user,
        to: target,
        subject: subject || 'Notification',
        text: message,
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};

// ── Meta WhatsApp Cloud API (official) ────────────────────────────────────────
const metaAdapter: ChannelAdapter = {
  kind: 'whatsapp',
  provider: 'meta',
  async send(creds, target, message): Promise<SendResult> {
    try {
      const to  = target.replace(/\D/g, '');
      const res = await fetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      });
      if (!res.ok) return { ok: false, error: `Meta API ${res.status}: ${await res.text().catch(() => '')}` };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};

// ── OpenWA (unofficial WhatsApp) ──────────────────────────────────────────────
const openwaAdapter: ChannelAdapter = {
  kind: 'whatsapp',
  provider: 'openwa',
  async send(creds, target, message): Promise<SendResult> {
    try {
      const baseUrl = creds.baseUrl || process.env.OPENWA_BASE_URL || 'http://localhost:2785/api';
      const apiKey  = creds.apiKey  || process.env.OPENWA_API_KEY  || '';
      const to      = target.replace(/\D/g, '');
      const res = await fetch(`${baseUrl}/sessions/${creds.sessionId}/messages/send-text`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: `${to}@c.us`, text: message }),
      });
      if (!res.ok) return { ok: false, error: `OpenWA ${res.status}` };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};

// ── Twilio (SMS) ──────────────────────────────────────────────────────────────
const twilioAdapter: ChannelAdapter = {
  kind: 'sms',
  provider: 'twilio',
  async send(creds, target, message): Promise<SendResult> {
    try {
      const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');
      const body = new URLSearchParams({ To: target, From: creds.from, Body: message });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${await res.text().catch(() => '')}` };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};

export const ADAPTERS: Record<Provider, ChannelAdapter> = {
  smtp:   smtpAdapter,
  meta:   metaAdapter,
  openwa: openwaAdapter,
  twilio: twilioAdapter,
};
