import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { clearSessionCookie, createSessionToken, parseCookies, sessionCookie, verifySessionToken } from './session.js';

const secret = randomBytes(32);

describe('session tokens', () => {
  it('round-trips a user id', () => {
    const token = createSessionToken('user-1', secret, 60);
    expect(verifySessionToken(token, secret)).toBe('user-1');
  });

  it('expires', () => {
    const issued = new Date('2026-01-01T00:00:00Z');
    const token = createSessionToken('user-1', secret, 60, issued);
    expect(verifySessionToken(token, secret, new Date('2026-01-01T00:00:59Z'))).toBe('user-1');
    expect(verifySessionToken(token, secret, new Date('2026-01-01T00:01:00Z'))).toBeNull();
  });

  it('rejects a different secret, tampering, and garbage', () => {
    const token = createSessionToken('user-1', secret, 60);
    expect(verifySessionToken(token, randomBytes(32))).toBeNull();
    const [payload, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ uid: 'user-2', exp: 9_999_999_999 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifySessionToken(`${payload}.${sig.slice(1)}`, secret)).toBeNull();
    expect(verifySessionToken('', secret)).toBeNull();
    expect(verifySessionToken('nodot', secret)).toBeNull();
    expect(verifySessionToken('.onlysig', secret)).toBeNull();
  });
});

describe('cookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('a=1; session=abc%2Edef; b')).toEqual({ a: '1', session: 'abc.def' });
    expect(parseCookies(undefined)).toEqual({});
  });

  it('builds a hardened session cookie', () => {
    const c = sessionCookie('tok', { secure: true, maxAgeSeconds: 10 });
    expect(c).toContain('session=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
    expect(c).toContain('Max-Age=10');
    expect(sessionCookie('tok', { secure: false, maxAgeSeconds: 10 })).not.toContain('Secure');
    expect(clearSessionCookie(false)).toContain('Max-Age=0');
  });
});
