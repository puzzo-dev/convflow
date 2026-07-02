// Shared outbound-HTTP helpers for terminal webhooks and pluggable node actions.
// Centralises SSRF protection + timeout so every outbound call is guarded the same way.
export const OUTBOUND_TIMEOUT_MS = 15_000;
// Block SSRF targets: private/loopback/link-local/metadata hosts.
const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/i;
export function validateWebhookUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        throw new Error(`Invalid URL: ${raw}`);
    }
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('URL must use http or https');
    if (PRIVATE_HOST_RE.test(url.hostname))
        throw new Error('URL targets a private or reserved address');
    return url;
}
// Extract the locked origin from a URL template that may contain {token} placeholders.
// Placeholders are stripped before parsing; if a placeholder is in the host the URL
// becomes invalid, which prevents tenants from making the origin user-controlled.
export function getUrlTemplateOrigin(template) {
    const normalized = template.replace(/\{[^}]+\}/g, '');
    return validateWebhookUrl(normalized).origin;
}
// fetch() with an AbortController timeout. Validates the URL for SSRF first.
// If allowedOrigin is supplied, the parsed URL must match it exactly.
export async function guardedFetch(rawUrl, init, allowedOrigin) {
    const url = validateWebhookUrl(rawUrl);
    if (allowedOrigin && url.origin !== allowedOrigin) {
        throw new Error(`URL origin mismatch: expected ${allowedOrigin}, got ${url.origin}`);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), OUTBOUND_TIMEOUT_MS);
    try {
        return await fetch(rawUrl, { ...init, signal: ac.signal });
    }
    finally {
        clearTimeout(timer);
    }
}
