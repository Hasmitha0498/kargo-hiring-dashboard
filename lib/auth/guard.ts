// Server-side session checks. The proxy already redirects unauthenticated requests; these repeat the check inside
// every page and route handler so a matcher mistake can never expose data.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken } from './session';

export async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, process.env.ADMIN_PASSWORD?.trim() || undefined);
}

/** For pages: redirect to /login when not signed in. */
export async function requirePageSession() {
  if (!(await isAuthenticated())) redirect('/login');
}

/** For route handlers: returns a 401 Response when not signed in, otherwise null. */
export async function requireApiSession(): Promise<Response | null> {
  return (await isAuthenticated()) ? null : Response.json({ error: 'Not signed in.' }, { status: 401 });
}
