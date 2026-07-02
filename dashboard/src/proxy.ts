import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  // Logged-in users shouldn't linger on login/register.
  if (isAuthPage) {
    if (token) return NextResponse.redirect(new URL('/', req.url));
    return NextResponse.next();
  }

  // Protect every other page.
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Exclude /api (so next-auth's own endpoints are never intercepted), Next
  // internals, and static assets. /login and /register ARE matched so we can
  // redirect already-authenticated users away from them.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|assets|.*\\.png$).*)'],
};
