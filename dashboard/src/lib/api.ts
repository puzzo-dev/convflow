'use client';
import { getSession, signOut } from 'next-auth/react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011';

/**
 * Authenticated fetch wrapper — automatically attaches the convflowToken
 * from the NextAuth session as a Bearer header.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const session = await getSession();
  const token   = (session as any)?.convflowToken;

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token)                        headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    // A 401 means the token is expired or the account was disabled/removed.
    // Tear down the stale session and bounce to login instead of surfacing a
    // confusing error toast on every subsequent request.
    if (res.status === 401 && typeof window !== 'undefined') {
      signOut({ callbackUrl: '/login' });
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}
