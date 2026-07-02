import { CompanyConfig } from '../types';

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',        // cloud metadata
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isBlockedIp(hostname: string): boolean {
  // Cloud metadata and private ranges other than loopback (localhost is allowed
  // for the default dev fallback). Production should still use a real host.
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

export function validateOpenwaUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`OpenWA URL must use http or https, got: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('OpenWA URL must not contain credentials');
  }
  if (url.search || url.hash) {
    throw new Error('OpenWA URL must not contain query or fragment');
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || isBlockedIp(hostname)) {
    throw new Error(`OpenWA URL points to a forbidden host: ${hostname}`);
  }
  return url;
}

export function sanitizeSessionId(raw: string): string {
  // Prevent path traversal / query injection in the URL path segment.
  const safe = String(raw).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Invalid OpenWA session ID');
  return safe;
}

// Server-controlled OpenWA gateway. We deliberately do NOT use the per-tenant
// config value for the URL because that value is derived from request-scoped
// tenant data and could be manipulated to point at internal services (SSRF).
export const OPENWA_BASE_URL = validateOpenwaUrl(
  process.env.OPENWA_BASE_URL ?? 'http://localhost:2785/api'
).toString();

function client(company: CompanyConfig, path: string, options: RequestInit) {
  const cfg    = company as any;
  const apiKey = cfg.openwaApiKey ?? process.env.OPENWA_API_KEY ?? '';

  const finalUrl = new URL(OPENWA_BASE_URL);
  finalUrl.pathname = `${finalUrl.pathname.replace(/\/$/, '')}${path}`;

  return fetch(finalUrl.toString(), {
    ...options,
    headers: {
      'X-API-Key':     apiKey,
      'Content-Type':  'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
}

function normalizePhone(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

export async function sendMessage(company: CompanyConfig, to: string, text: string): Promise<void> {
  try {
    const sessionId = sanitizeSessionId(company.openwaSessionId);
    const safeTo    = normalizePhone(to);
    const res = await client(company, `/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      body:   JSON.stringify({ chatId: `${safeTo}@c.us`, text }),
    });
    if (!res.ok) throw new Error(`Failed to send message, status: ${res.status}`);
  } catch (err: any) {
    console.error(`[${company.slug}] Send failed to ${to}:`, err.message);
  }
}

export async function sendImage(company: CompanyConfig, to: string, imageUrl: string): Promise<void> {
  try {
    const sessionId = sanitizeSessionId(company.openwaSessionId);
    const safeTo    = normalizePhone(to);
    const res = await client(company, `/sessions/${sessionId}/messages/send-image`, {
      method: 'POST',
      body:   JSON.stringify({ chatId: `${safeTo}@c.us`, url: imageUrl }),
    });
    if (!res.ok) throw new Error(`Failed to send image, status: ${res.status}`);
  } catch (err: any) {
    console.error(`[${company.slug}] Image send failed to ${to}:`, err.message);
  }
}
