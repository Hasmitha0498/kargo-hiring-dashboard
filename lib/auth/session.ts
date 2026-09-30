// Password gate for a single founder/admin. A successful login sets an httpOnly cookie holding an expiry and an
// HMAC signature keyed from ADMIN_PASSWORD (changing the password logs everyone out). Uses Web Crypto so the same
// code runs in the proxy and in route handlers.

export const SESSION_COOKIE = 'kargo_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function key(password: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(`kargo-session-v1:${password}`));
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Constant-time string comparison (avoids leaking how many leading characters matched). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSessionToken(password: string, nowMs = Date.now()): Promise<string> {
  const payload = `v1.${Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS}.${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
  const sig = await crypto.subtle.sign('HMAC', await key(password), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined, password: string | undefined, nowMs = Date.now()): Promise<boolean> {
  if (!token || !password) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const payload = parts.slice(0, 3).join('.');
  const expected = b64url(await crypto.subtle.sign('HMAC', await key(password), enc.encode(payload)));
  return safeEqual(expected, parts[3]!);
}
