import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stateless signed session tokens: base64url(payload) + "." + base64url(hmac).
 * The payload is `{ uid, exp }`. Nothing secret is stored in the token, and the
 * signature covers the whole payload, so it cannot be forged or extended.
 */

interface SessionPayload {
  uid: string;
  exp: number; // unix seconds
}

function sign(payload: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function createSessionToken(userId: string, secret: Buffer, ttlSeconds: number, now = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp } satisfies SessionPayload), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

/** Returns the user id for a valid, unexpired token, otherwise null. */
export function verifySessionToken(token: string, secret: Buffer, now = new Date()): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = sign(payload, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { uid, exp } = parsed as Partial<SessionPayload>;
  if (typeof uid !== 'string' || typeof exp !== 'number') return null;
  if (exp <= Math.floor(now.getTime() / 1000)) return null;
  return uid;
}

export const SESSION_COOKIE = 'session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  secure: boolean;
  maxAgeSeconds: number;
}

export function sessionCookie(token: string, { secure, maxAgeSeconds }: CookieOptions): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', { secure, maxAgeSeconds: 0 });
}
