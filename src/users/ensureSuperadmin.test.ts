import { describe, expect, it } from 'vitest';
import { FakeAuditLog } from '../test/fakeAudit.js';
import { FakeUserRepository } from '../test/fakeUsers.js';
import { ensureSuperadmin } from './ensureSuperadmin.js';

describe('ensureSuperadmin', () => {
  it('does nothing when the email has not registered', async () => {
    const users = new FakeUserRepository();
    const audit = new FakeAuditLog();
    await users.create({ email: 'a@x.io', passwordHash: 'h', role: 'member', status: 'pending' });
    await ensureSuperadmin(users, audit, 'root@x.io');
    expect(audit.entries).toEqual([]);
    expect((await users.findByEmail('a@x.io'))?.role).toBe('member');
  });

  it('binds the designated email and demotes any stale superadmin', async () => {
    const users = new FakeUserRepository();
    const audit = new FakeAuditLog();
    const old = await users.create({ email: 'old@x.io', passwordHash: 'h', role: 'superadmin', status: 'active' });
    const next = await users.create({ email: 'New@x.io', passwordHash: 'h', role: 'member', status: 'pending' });
    await ensureSuperadmin(users, audit, 'new@x.io');
    expect(await users.findById(old.id)).toMatchObject({ role: 'admin', status: 'active' });
    expect(await users.findById(next.id)).toMatchObject({ role: 'superadmin', status: 'active' });
    expect(audit.entries.map((e) => e.action).sort()).toEqual(['user.role_changed', 'user.superadmin_bound']);
    expect(audit.entries.every((e) => e.actorId === null)).toBe(true);
  });

  it('is idempotent', async () => {
    const users = new FakeUserRepository();
    const audit = new FakeAuditLog();
    await users.create({ email: 'root@x.io', passwordHash: 'h', role: 'superadmin', status: 'active' });
    await ensureSuperadmin(users, audit, 'root@x.io');
    expect(audit.entries).toEqual([]);
  });
});
