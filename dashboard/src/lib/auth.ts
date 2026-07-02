import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011';

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(`${API}/platform/auth/login`, {
          method:  'POST',
          body:    JSON.stringify({ email: credentials?.email, password: credentials?.password }),
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return null;
        const { token, user } = await res.json();
        return { ...user, token };
      },
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.convflowToken = (user as any).token;
        token.role = (user as any).role;
        token.name = (user as any).name;
        token.email = (user as any).email;
      }
      return token;
    },
    async session({ session, token }) {
      // Seed from the JWT snapshot first (works offline).
      let role   = token.role as string | undefined;
      let name   = token.name as string | undefined;
      let email  = token.email as string | undefined;
      let active = true;

      // Reconcile with live DB state so role changes / deactivation reflect
      // without forcing re-login. /platform/auth/me returns { user: {...} }.
      try {
        const res = await fetch(`${API}/platform/auth/me`, {
          headers: { Authorization: `Bearer ${token.convflowToken as string}` },
        });
        if (res.ok) {
          const { user } = await res.json();
          if (user) {
            role   = user.role;
            name   = user.name;
            email  = user.email;
            active = user.active;
          }
        }
      } catch {
        // offline fallback — keep JWT snapshot
      }

      // Expose on BOTH the top level and session.user so every consumer agrees.
      (session as any).convflowToken = token.convflowToken;
      (session as any).role   = role;
      (session as any).active = active;
      session.user = { ...(session.user ?? {}), name, email, role } as any;
      return session;
    },
  },
};
