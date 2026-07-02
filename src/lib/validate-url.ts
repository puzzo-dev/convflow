// src/lib/validate-url.ts
import { URL } from 'url';
import { lookup } from 'dns/promises';

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b, c] = parts;
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a === 127 || // 127.0.0.0/8
    (a === 169 && b === 254) || // 169.254.0.0/16
    a === 0 || // 0.0.0.0/8
    (a >= 224 && a <= 239) || // multicast
    a >= 240 // reserved/experimental
  );
}

function isPrivateIPv6(ip: string): boolean {
  const clean = ip.split('%')[0].toLowerCase();
  const parts = clean.split(':').filter(p => p !== '');

  // ::1
  if (parts.length === 1 && parts[0] === '1') return true;

  if (parts.length > 0) {
    const first16 = parseInt(parts[0].padEnd(2, '0').substring(0, 2), 16);
    if ((first16 & 0xfe) === 0xfc) return true; // fc00::/7 unique local
    if ((first16 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  }

  // IPv4-mapped IPv6 addresses
  const match = clean.match(/[0:]?(?:ffff|FFFF):([0-9a-f.:]+)$/);
  if (match) {
    const last = match[1].split(':').pop();
    if (last && last.includes('.')) return isPrivateIPv4(last);
  }

  return false;
}

function isPrivateHost(host: string): boolean {
  const normalized = host.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return isPrivateIPv6(normalized.slice(1, -1));
  }
  return normalized.includes(':') ? isPrivateIPv6(normalized) : isPrivateIPv4(normalized);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(
  slug: string
): { valid: true; slug: string } | { valid: false; reason: string } {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, reason: 'Slug is required' };
  }

  const normalized = slug.trim().toLowerCase();
  if (!SLUG_RE.test(normalized)) {
    return { valid: false, reason: 'Invalid slug format' };
  }

  return { valid: true, slug: normalized };
}

export function validateExternalUrl(
  url: string
): { valid: true; origin: string } | { valid: false; reason: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL is required' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTP and HTTPS URLs are allowed' };
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    return { valid: false, reason: 'Private or internal URLs are not allowed' };
  }

  // Normalize to origin so path/query fragments cannot be injected through baseURL.
  const origin = `${parsed.protocol}//${parsed.host}`;
  return { valid: true, origin };
}

const DNS_LOOKUP_MS = 5_000;

export async function validateExternalUrlAsync(
  url: string
): Promise<{ valid: true; origin: string } | { valid: false; reason: string }> {
  const sync = validateExternalUrl(url);
  if (!sync.valid) return sync;

  const parsed = new URL(url);
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_LOOKUP_MS)
    );
    const addresses = await Promise.race([
      lookup(parsed.hostname, { all: true, verbatim: true }),
      timeout,
    ]);
    for (const { address } of addresses) {
      if (isPrivateHost(address)) {
        return { valid: false, reason: 'Private or internal URLs are not allowed' };
      }
    }
  } catch {
    return { valid: false, reason: 'Could not resolve hostname' };
  }

  return sync;
}
