// Optimistic auth check before any page or API route runs. Pages and handlers re-check (lib/auth/guard.ts).
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth/session';

export async function proxy(request: NextRequest) {
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.ADMIN_PASSWORD?.trim() || undefined);
  if (ok) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, the login API, and static assets.
  matcher: ['/((?!login|api/auth/login|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
