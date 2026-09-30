import { cookies } from 'next/headers';
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth/session';
import { log } from '@/lib/log';

export async function POST(request: Request) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return Response.json({ error: 'ADMIN_PASSWORD is not configured on the server.' }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === 'string' ? body.password : '';
  if (!safeEqual(password, expected)) {
    log.warn('auth.login_failed');
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: 'Incorrect password.' }, { status: 401 });
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return Response.json({ ok: true });
}
