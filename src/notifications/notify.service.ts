import { prisma } from '../store/prisma';
import { decryptJson } from './crypto';
import { ADAPTERS } from './channels/adapters';
import { ChannelKind, Provider, SendResult } from './channels/types';

export interface NotifyRequest {
  userId: string;
  channels: ChannelKind[];                          // which kinds to send on
  message: string;
  subject?: string;
  targets?: Partial<Record<ChannelKind, string>>;   // recipient per kind (owner email/phone)
}

export interface ChannelResult extends SendResult {
  kind: ChannelKind;
  provider: Provider | null;
  usedFallback: boolean;
}

// Default provider used when falling back to global platform creds.
const FALLBACK_PROVIDER: Record<ChannelKind, Provider> = {
  email:    'smtp',
  whatsapp: 'meta',
  sms:      'twilio',
};

// Global platform credentials, read from env. Used when a user has no channel
// of the requested kind. Returns null if the platform hasn't configured them.
function globalCreds(provider: Provider): Record<string, string> | null {
  const e = process.env;
  switch (provider) {
    case 'smtp':
      if (!e.GLOBAL_SMTP_HOST) return null;
      return { host: e.GLOBAL_SMTP_HOST, port: e.GLOBAL_SMTP_PORT ?? '587',
               user: e.GLOBAL_SMTP_USER ?? '', pass: e.GLOBAL_SMTP_PASS ?? '', from: e.GLOBAL_SMTP_FROM ?? '' };
    case 'meta':
      if (!e.GLOBAL_META_PHONE_ID || !e.GLOBAL_META_TOKEN) return null;
      return { phoneNumberId: e.GLOBAL_META_PHONE_ID, accessToken: e.GLOBAL_META_TOKEN };
    case 'twilio':
      if (!e.GLOBAL_TWILIO_SID || !e.GLOBAL_TWILIO_TOKEN) return null;
      return { accountSid: e.GLOBAL_TWILIO_SID, authToken: e.GLOBAL_TWILIO_TOKEN, from: e.GLOBAL_TWILIO_FROM ?? '' };
    case 'openwa':
      if (!e.OPENWA_BASE_URL) return null;
      return { baseUrl: e.OPENWA_BASE_URL, apiKey: e.OPENWA_API_KEY ?? '', sessionId: e.GLOBAL_OPENWA_SESSION ?? '' };
    default:
      return null;
  }
}

/**
 * Send a notification across the requested channels for a user.
 * Per channel: use the user's own credentials if they have a channel of that
 * kind, otherwise fall back to the platform's global credentials. Each channel
 * is dispatched independently; one failing never blocks the others.
 */
export async function notify(req: NotifyRequest): Promise<ChannelResult[]> {
  const userChannels = await prisma.notificationChannel.findMany({
    where: { userId: req.userId, enabled: true },
  });

  const results: ChannelResult[] = [];

  for (const kind of req.channels) {
    const own = userChannels.find(c => c.kind === kind);
    let provider: Provider;
    let creds: Record<string, string> | null;
    let usedFallback = false;
    let target = req.targets?.[kind];

    if (own) {
      provider = own.provider as Provider;
      try {
        creds = decryptJson(own.credentials);
      } catch (err: any) {
        results.push({ kind, provider, ok: false, usedFallback: false, error: `Credential decrypt failed: ${err.message}` });
        continue;
      }
      target = target ?? own.target ?? undefined;
    } else {
      provider = FALLBACK_PROVIDER[kind];
      creds = globalCreds(provider);
      usedFallback = true;
    }

    if (!creds) {
      results.push({ kind, provider, ok: false, usedFallback, error: `No ${kind} channel configured and no global fallback available` });
      continue;
    }
    if (!target) {
      results.push({ kind, provider, ok: false, usedFallback, error: `No destination address for ${kind}` });
      continue;
    }

    const adapter = ADAPTERS[provider];
    const result  = await adapter.send(creds, target, req.message, req.subject);
    results.push({ kind, provider, usedFallback, ...result });
  }

  return results;
}

// Send a test message through a single stored channel (used by the settings UI).
export async function testChannel(channelId: string, userId: string): Promise<ChannelResult> {
  const ch = await prisma.notificationChannel.findFirst({ where: { id: channelId, userId } });
  if (!ch) return { kind: 'email', provider: null, ok: false, usedFallback: false, error: 'Channel not found' };

  const provider = ch.provider as Provider;
  let creds: Record<string, string>;
  try {
    creds = decryptJson(ch.credentials);
  } catch (err: any) {
    return { kind: ch.kind as ChannelKind, provider, ok: false, usedFallback: false, error: `Decrypt failed: ${err.message}` };
  }
  if (!ch.target) {
    return { kind: ch.kind as ChannelKind, provider, ok: false, usedFallback: false, error: 'This channel has no destination address set' };
  }

  const adapter = ADAPTERS[provider];
  const result  = await adapter.send(creds, ch.target, 'ConvFlow test notification ✅ — your channel is working.', 'ConvFlow test');
  return { kind: ch.kind as ChannelKind, provider, usedFallback: false, ...result };
}
