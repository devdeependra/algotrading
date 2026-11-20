import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createPool } from './pool.js';
import { PgAuditLogRepository } from './repositories/auditLog.js';
import { PgUserRepository, DuplicateEmailError } from './repositories/users.js';
import { migrationStatus, MIGRATIONS_DIR, runMigrations, scaffoldMigration } from './migrate.js';

const url = process.env['TEST_DATABASE_URL'];

describe('scaffoldMigration', () => {
  it('writes a timestamped, slugged file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    const file = scaffoldMigration('Add Broker Accounts!', dir);
    expect(file).toMatch(/^\d{14}_add_broker_accounts\.sql$/);
    expect(() => scaffoldMigration('', dir)).toThrow();
  });
});

// Runs only when TEST_DATABASE_URL points at a scratch database. Every table
// is dropped at the end, so never point it at a database you care about.
describe.skipIf(!url)('migrations against Postgres', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool(url as string);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  });

  afterAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.end();
  });

  it('applies the real migrations once and records them', async () => {
    const first = await runMigrations(pool, MIGRATIONS_DIR);
    expect(first.length).toBeGreaterThan(0);
    const second = await runMigrations(pool, MIGRATIONS_DIR);
    expect(second).toEqual([]);
    const status = await migrationStatus(pool, MIGRATIONS_DIR);
    expect(status.pending).toEqual([]);
    expect(status.applied).toEqual(first);
  });

  it('rolls back a failing migration without recording it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '00001_bad.sql'), 'CREATE TABLE will_roll_back (id int); SELECT * FROM no_such_table;');
    await expect(runMigrations(pool, dir)).rejects.toThrow(/00001_bad\.sql/);
    const { rows } = await pool.query("SELECT to_regclass('will_roll_back') AS t");
    expect(rows[0].t).toBeNull();
    const { applied } = await migrationStatus(pool, dir);
    expect(applied).not.toContain('00001_bad.sql');
  });

  it('users repository: uniqueness, defaults, list filter, patch update', async () => {
    const users = new PgUserRepository(pool);
    const u = await users.create({ email: 'Op@Example.com', passwordHash: 'hash', role: 'member', status: 'pending' });
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u).toMatchObject({ role: 'member', status: 'pending', approvedBy: null, approvedAt: null });
    expect(await users.findByEmail('OP@EXAMPLE.COM')).toMatchObject({ id: u.id });
    expect(await users.findById(u.id)).toMatchObject({ email: 'Op@Example.com' });
    await expect(users.create({ email: 'op@example.com', passwordHash: 'hash2', role: 'member', status: 'pending' })).rejects.toThrow(DuplicateEmailError);

    const root = await users.create({ email: 'root@example.com', passwordHash: 'h', role: 'superadmin', status: 'active' });
    expect((await users.list({ status: 'pending' })).map((x) => x.id)).toEqual([u.id]);
    expect((await users.list()).map((x) => x.id)).toEqual([u.id, root.id]);

    const when = new Date('2026-01-02T03:04:05Z');
    const updated = await users.update(u.id, { status: 'active', approvedBy: root.id, approvedAt: when });
    expect(updated).toMatchObject({ status: 'active', approvedBy: root.id, approvedAt: when });
    expect(await users.update('00000000-0000-0000-0000-000000000000', { status: 'active' })).toBeNull();
    expect(await users.update(u.id, {})).toMatchObject({ id: u.id });

    const audit = new PgAuditLogRepository(pool);
    await audit.append({ actorId: root.id, action: 'user.approved', entityType: 'user', entityId: u.id, before: { status: 'pending' }, after: { status: 'active' } });
    const { rows } = await pool.query('SELECT actor_id, action, before, after FROM audit_log');
    expect(rows).toEqual([{ actor_id: root.id, action: 'user.approved', before: { status: 'pending' }, after: { status: 'active' } }]);
  });
});
