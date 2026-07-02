import { CompanyConfig } from '../types';

// Use per-tenant OpenWA credentials from the config, falling back to env vars.
// This enables each tenant to connect to their own OpenWA instance.
function client(company: CompanyConfig, path: string, options: RequestInit) {
  const cfg     = company as any;
  const baseUrl = cfg.openwaBaseUrl ?? process.env.OPENWA_BASE_URL ?? 'http://localhost:2785/api';
  const apiKey  = cfg.openwaApiKey  ?? process.env.OPENWA_API_KEY  ?? '';

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'X-API-Key':     apiKey,
      'Content-Type':  'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
}

export async function sendMessage(company: CompanyConfig, to: string, text: string): Promise<void> {
  try {
    const res = await client(company, `/sessions/${company.openwaSessionId}/messages/send-text`, {
      method: 'POST',
      body:   JSON.stringify({ chatId: `${to}@c.us`, text }),
    });
    if (!res.ok) throw new Error(`Failed to send message, status: ${res.status}`);
  } catch (err: any) {
    console.error(`[${company.slug}] Send failed to ${to}:`, err.message);
  }
}

export async function sendImage(company: CompanyConfig, to: string, imageUrl: string): Promise<void> {
  try {
    const res = await client(company, `/sessions/${company.openwaSessionId}/messages/send-image`, {
      method: 'POST',
      body:   JSON.stringify({ chatId: `${to}@c.us`, url: imageUrl }),
    });
    if (!res.ok) throw new Error(`Failed to send image, status: ${res.status}`);
  } catch (err: any) {
    console.error(`[${company.slug}] Image send failed to ${to}:`, err.message);
  }
}
