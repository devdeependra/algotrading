import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeAuditLog } from '../test/fakeAudit.js';
import { FakeUserRepository } from '../test/fakeUsers.js';
import { testConfig } from '../test/testConfig.js';
import { createApp } from './app.js';

const fastScrypt = { N: 2 ** 10, r: 8, p: 1 };
const PW = 'correct-horse-battery';

describe('API', () => {
  let server: Server;
  let base: string;
  let dbUp = true;
  const users = new FakeUserRepository();
  const audit = new FakeAuditLog();

  beforeAll(async () => {
    const app = createApp({ config: testConfig(), users, audit, checkDb: async () => dbUp, version: '0.0.0-test', scryptParams: fastScrypt });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const call = (method: string, path: string, body?: unknown, cookie?: string) =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const post = (path: string, body: unknown, cookie?: string) => call('POST', path, body, cookie);
  const get = (path: string, cookie?: string) => call('GET', path, undefined, cookie);

  const cookieOf = (res: Response): string => {
    const raw = res.headers.get('set-cookie');
    expect(raw).toBeTruthy();
    return (raw as string).split(';')[0] as string;
  };

  async function register(email: string): Promise<{ cookie: string; id: string; body: Record<string, unknown> }> {
    const res = await post('/api/auth/register', { email, password: PW });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    return { cookie: cookieOf(res), id: body['id'] as string, body };
  }

  it('health reports ok with the db up and 503 when it is down', async () => {
    const ok = await get('/api/health');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: 'ok', db: 'ok', version: '0.0.0-test' });
    dbUp = false;
    expect((await get('/api/health')).status).toBe(503);
    dbUp = true;
  });

  it('hides the server header and 404s unknown api routes as json', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('validates registration input', async () => {
    expect((await post('/api/auth/register', { email: 'bad', password: PW })).status).toBe(400);
    expect((await post('/api/auth/register', { email: 'a@b.co', password: 'short' })).status).toBe(400);
    expect((await post('/api/auth/register', 'not an object')).status).toBe(400);
  });

  it('the configured superadmin email registers as superadmin + active; everyone else pending member', async () => {
    const root = await register('Root@Example.com');
    expect(root.body).toMatchObject({ email: 'root@example.com', role: 'superadmin', status: 'active' });
    expect(root.body).not.toHaveProperty('passwordHash');
    const m = await register('member@example.com');
    expect(m.body).toMatchObject({ role: 'member', status: 'pending', approvedAt: null });
    expect(audit.entries.filter((e) => e.action === 'user.registered')).toHaveLength(2);
  });

  it('login, me, duplicate, wrong password, logout', async () => {
    const dup = await post('/api/auth/register', { email: 'member@example.com', password: PW });
    expect(dup.status).toBe(409);
    const wrong = await post('/api/auth/login', { email: 'member@example.com', password: 'wrong-password-x' });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const unknown = await post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password-x' });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());

    const login = await post('/api/auth/login', { email: 'MEMBER@example.com', password: PW });
    expect(login.status).toBe(200);
    const cookie = cookieOf(login);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    const me = await get('/api/auth/me', cookie);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: 'member@example.com', status: 'pending' });

    const out = await post('/api/auth/logout', {}, cookie);
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('rejects /me without, or with a bad, session', async () => {
    expect((await get('/api/auth/me')).status).toBe(401);
    expect((await get('/api/auth/me', 'session=forged.token')).status).toBe(401);
  });

  it('pending members can change their password but not reach admin routes', async () => {
    const login = await post('/api/auth/login', { email: 'member@example.com', password: PW });
    const cookie = cookieOf(login);
    expect((await get('/api/admin/users', cookie)).status).toBe(403);
    expect((await post('/api/auth/password', { currentPassword: 'nope-nope-nope', newPassword: 'new-password-long' }, cookie)).status).toBe(401);
    expect((await post('/api/auth/password', { currentPassword: PW, newPassword: 'short' }, cookie)).status).toBe(400);
    expect((await post('/api/auth/password', { currentPassword: PW, newPassword: 'member-new-password' }, cookie)).status).toBe(204);
    expect((await post('/api/auth/login', { email: 'member@example.com', password: PW })).status).toBe(401);
    expect((await post('/api/auth/login', { email: 'member@example.com', password: 'member-new-password' })).status).toBe(200);
  });

  it('admin workflow: list, approve, promote, admin limits, suspend blocks login, reinstate', async () => {
    const rootLogin = await post('/api/auth/login', { email: 'root@example.com', password: PW });
    const root = cookieOf(rootLogin);
    const rootId = ((await (await get('/api/auth/me', root)).json()) as { id: string }).id;
    const memberId = (users.users.find((u) => u.email === 'member@example.com') as { id: string }).id;
    const second = await register('second@example.com');

    const pending = await get('/api/admin/users?status=pending', root);
    expect(pending.status).toBe(200);
    expect(((await pending.json()) as unknown[]).length).toBe(2);
    expect((await get('/api/admin/users?status=bogus', root)).status).toBe(400);

    // approve member, promote to admin
    const approved = await post(`/api/admin/users/${memberId}/approve`, {}, root);
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ status: 'active', approvedAt: expect.any(String) });
    expect((await post(`/api/admin/users/${memberId}/approve`, {}, root)).status).toBe(403);
    const promoted = await call('PATCH', `/api/admin/users/${memberId}/role`, { role: 'admin' }, root);
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({ role: 'admin' });
    expect((await call('PATCH', `/api/admin/users/${memberId}/role`, { role: 'superadmin' }, root)).status).toBe(403);

    // the new admin can approve others but cannot change roles or touch root / self
    const adminCookie = cookieOf(await post('/api/auth/login', { email: 'member@example.com', password: 'member-new-password' }));
    expect((await post(`/api/admin/users/${second.id}/approve`, {}, adminCookie)).status).toBe(200);
    expect((await call('PATCH', `/api/admin/users/${second.id}/role`, { role: 'admin' }, adminCookie)).status).toBe(403);
    expect((await post(`/api/admin/users/${rootId}/suspend`, {}, adminCookie)).status).toBe(403);
    expect((await post(`/api/admin/users/${memberId}/suspend`, {}, adminCookie)).status).toBe(403);
    expect((await post(`/api/admin/users/00000000-0000-0000-0000-000000000000/suspend`, {}, root)).status).toBe(404);

    // suspend second: existing session dies, login refused, reinstate restores
    expect((await post(`/api/admin/users/${second.id}/suspend`, {}, adminCookie)).status).toBe(200);
    expect((await get('/api/auth/me', second.cookie)).status).toBe(401);
    const refused = await post('/api/auth/login', { email: 'second@example.com', password: PW });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'Account suspended' });
    expect((await post(`/api/admin/users/${second.id}/reinstate`, {}, root)).status).toBe(200);
    expect((await post('/api/auth/login', { email: 'second@example.com', password: PW })).status).toBe(200);

    // reject a fresh signup, then approve from rejected
    const third = await register('third@example.com');
    expect((await post(`/api/admin/users/${third.id}/reject`, {}, root)).status).toBe(200);
    expect((await post('/api/auth/login', { email: 'third@example.com', password: PW })).status).toBe(403);
    expect((await post(`/api/admin/users/${third.id}/approve`, {}, root)).status).toBe(200);

    const actions = audit.entries.map((e) => e.action);
    for (const a of ['user.approved', 'user.role_changed', 'user.suspended', 'user.reinstated', 'user.rejected']) {
      expect(actions).toContain(a);
    }
    expect(audit.entries.every((e) => JSON.stringify(e).includes('passwordHash') === false)).toBe(true);
  });

  it('does not leak internals on unexpected errors', async () => {
    const broken = createApp({
      config: testConfig(),
      users: { ...users, findByEmail: async () => { throw new Error('secret-pin-1234 leaked'); } } as never,
      audit,
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
