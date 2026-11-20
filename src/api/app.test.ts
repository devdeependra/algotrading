import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { FakeUserRepository } from '../test/fakeUsers.js';
import { testConfig } from '../test/testConfig.js';
import { createApp } from './app.js';

const fastScrypt = { N: 2 ** 10, r: 8, p: 1 };

describe('API', () => {
  let server: Server;
  let base: string;
  let dbUp = true;
  const users = new FakeUserRepository();

  beforeAll(async () => {
    const app = createApp({
      config: testConfig(),
      users,
      checkDb: async () => dbUp,
      version: '0.0.0-test',
      scryptParams: fastScrypt,
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const post = (path: string, body: unknown, cookie?: string) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  const cookieOf = (res: Response): string => {
    const raw = res.headers.get('set-cookie');
    expect(raw).toBeTruthy();
    return (raw as string).split(';')[0] as string;
  };

  it('health reports ok with the db up and 503 when it is down', async () => {
    const ok = await fetch(`${base}/api/health`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'ok', db: 'ok', version: '0.0.0-test' });
    dbUp = false;
    const bad = await fetch(`${base}/api/health`);
    expect(bad.status).toBe(503);
    expect(await bad.json()).toMatchObject({ status: 'degraded', db: 'unavailable' });
    dbUp = true;
  });

  it('hides the server header and 404s unknown api routes as json', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('validates registration input', async () => {
    expect((await post('/api/auth/register', { email: 'bad', password: 'long-enough-pw' })).status).toBe(400);
    expect((await post('/api/auth/register', { email: 'a@b.co', password: 'short' })).status).toBe(400);
    expect((await post('/api/auth/register', 'not an object')).status).toBe(400);
  });

  it('registers, logs in, reads /me, and logs out', async () => {
    const reg = await post('/api/auth/register', { email: 'Op@Example.com', password: 'correct-horse-battery' });
    expect(reg.status).toBe(201);
    const body = (await reg.json()) as { id: string; email: string };
    expect(body.email).toBe('op@example.com');
    expect(body).not.toHaveProperty('passwordHash');
    const regCookie = cookieOf(reg);
    expect(reg.headers.get('set-cookie')).toContain('HttpOnly');

    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: regCookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ id: body.id, email: 'op@example.com' });

    const dup = await post('/api/auth/register', { email: 'op@example.com', password: 'another-long-one' });
    expect(dup.status).toBe(409);

    const wrong = await post('/api/auth/login', { email: 'op@example.com', password: 'wrong-password-x' });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const unknown = await post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-x' });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.clone().json().catch(() => ({ error: 'Invalid email or password' })));

    const login = await post('/api/auth/login', { email: 'OP@example.com', password: 'correct-horse-battery' });
    expect(login.status).toBe(200);
    const loginCookie = cookieOf(login);

    const out = await post('/api/auth/logout', {}, loginCookie);
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects /me without, or with a bad, session', async () => {
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: 'session=forged.token' } })).status).toBe(401);
  });

  it('does not leak internals on unexpected errors', async () => {
    const broken = createApp({
      config: testConfig(),
      users: { ...users, findByEmail: async () => { throw new Error('secret-pin-1234 leaked'); } } as never,
      checkDb: async () => true,
      version: 'x',
      scryptParams: fastScrypt,
    });
    const s = broken.listen(0);
    await new Promise<void>((resolve) => s.once('listening', resolve));
    const port = (s.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'long-enough-pw' }),
    });
    s.close();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('secret-pin');
    expect(JSON.parse(text)).toEqual({ error: 'Internal error' });
  });
});
