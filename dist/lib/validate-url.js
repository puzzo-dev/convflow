// src/lib/validate-url.ts
import { URL } from 'url';
import { lookup } from 'dns/promises';
import { lookup as dnsLookup } from 'dns';
import { isIP } from 'net';
import http from 'http';
import https from 'https';
const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0']);
function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
        return false;
    }
    const [a, b, c] = parts;
    return (a === 10 || // 10.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        a === 127 || // 127.0.0.0/8
        (a === 169 && b === 254) || // 169.254.0.0/16
        a === 0 || // 0.0.0.0/8
        (a >= 224 && a <= 239) || // multicast
        a >= 240 // reserved/experimental
    );
}
function expandIPv6(ip) {
    const clean = ip.split('%')[0].toLowerCase();
    if (clean.includes('::')) {
        const [left, right] = clean.split('::');
        const leftGroups = left ? left.split(':') : [];
        const rightGroups = right ? right.split(':') : [];
        const missing = 8 - leftGroups.length - rightGroups.length;
        if (missing < 0)
            return null;
        return [...leftGroups, ...Array(missing).fill('0'), ...rightGroups];
    }
    const groups = clean.split(':');
    return groups.length === 8 ? groups : null;
}
function isPrivateIPv6(ip) {
    const groups = expandIPv6(ip);
    if (!groups)
        return false;
    const first = parseInt(groups[0], 16);
    // fc00::/7 unique local
    if ((first & 0xfe00) === 0xfc00)
        return true;
    // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfe80)
        return true;
    // ::1 loopback
    if (groups.every((g, i) => (i === 7 ? parseInt(g, 16) === 1 : parseInt(g, 16) === 0))) {
        return true;
    }
    // IPv4-mapped (::ffff:x.x.x.x) and IPv4-compatible (::x.x.x.x) addresses
    if (groups.slice(0, 5).every(g => parseInt(g, 16) === 0) &&
        (groups[5] === 'ffff' || groups[5] === '0')) {
        const high = parseInt(groups[6], 16);
        const low = parseInt(groups[7], 16);
        const ipv4 = [
            (high >> 8) & 0xff,
            high & 0xff,
            (low >> 8) & 0xff,
            low & 0xff,
        ].join('.');
        return isPrivateIPv4(ipv4);
    }
    return false;
}
function isPrivateHost(host) {
    const normalized = host.toLowerCase().trim();
    if (BLOCKED_HOSTNAMES.has(normalized))
        return true;
    // Strip brackets from IPv6 literals so net.isIP can classify them.
    const ip = normalized.startsWith('[') && normalized.endsWith(']')
        ? normalized.slice(1, -1)
        : normalized;
    const version = isIP(ip);
    if (version === 4)
        return isPrivateIPv4(ip);
    if (version === 6)
        return isPrivateIPv6(ip);
    return false;
}
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validateSlug(slug) {
    if (!slug || typeof slug !== 'string') {
        return { valid: false, reason: 'Slug is required' };
    }
    const normalized = slug.trim().toLowerCase();
    if (!SLUG_RE.test(normalized)) {
        return { valid: false, reason: 'Invalid slug format' };
    }
    return { valid: true, slug: normalized };
}
export function validateExternalUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, reason: 'URL is required' };
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
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
export async function validateExternalUrlAsync(url) {
    const sync = validateExternalUrl(url);
    if (!sync.valid)
        return sync;
    const parsed = new URL(url);
    try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('DNS lookup timed out')), DNS_LOOKUP_MS));
        const addresses = await Promise.race([
            lookup(parsed.hostname, { all: true, verbatim: true }),
            timeout,
        ]);
        for (const { address } of addresses) {
            if (isPrivateHost(address)) {
                return { valid: false, reason: 'Private or internal URLs are not allowed' };
            }
        }
    }
    catch {
        return { valid: false, reason: 'Could not resolve hostname' };
    }
    return sync;
}
function safeLookup(hostname, _options, callback) {
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
        if (err)
            return callback(err, '', 0);
        if (!addresses.length)
            return callback(new Error('Could not resolve hostname'), '', 0);
        for (const { address } of addresses) {
            if (isPrivateHost(address)) {
                return callback(new Error('Private or internal address blocked'), '', 0);
            }
        }
        const first = addresses[0];
        callback(null, first.address, first.family);
    });
}
export const safeHttpAgent = new http.Agent({ lookup: safeLookup });
export const safeHttpsAgent = new https.Agent({ lookup: safeLookup });
