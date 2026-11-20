import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';
import { loadDotEnv } from '../config/dotenv.js';
import { createPool } from './pool.js';

/**
 * Forward-only SQL migrations. Each file in `migrations/` runs once, inside
 * its own transaction, in filename order. Applied names are recorded in
 * `schema_migrations`. There is no "down": write a new migration instead.
 */

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationStatus {
  applied: string[];
  pending: string[];
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function ensureTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function migrationStatus(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<MigrationStatus> {
  await ensureTable(pool);
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
  const applied = rows.map((r) => r.name);
  const appliedSet = new Set(applied);
  const pending = listMigrationFiles(dir).filter((f) => !appliedSet.has(f));
  return { applied, pending };
}

/** Applies every pending migration. Returns the names applied, in order. */
export async function runMigrations(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const { pending } = await migrationStatus(pool, dir);
  const done: string[] = [];
  for (const name of pending) {
    const sql = readFileSync(join(dir, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      done.push(name);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }
  return done;
}

function timestamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

export function scaffoldMigration(name: string, dir = MIGRATIONS_DIR): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (slug === '') throw new Error('Migration name is required');
  const file = `${timestamp()}_${slug}.sql`;
  writeFileSync(join(dir, file), `-- ${slug}\n-- Applied once, inside a transaction. Forward-only.\n\n`, { flag: 'wx' });
  return file;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === 'new') {
    const file = scaffoldMigration(rest.join(' '));
    process.stdout.write(`Created src/db/migrations/${file}\n`);
    return;
  }
  loadDotEnv();
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = createPool(url);
  try {
    if (command === 'up') {
      const applied = await runMigrations(pool);
      process.stdout.write(applied.length === 0 ? 'Nothing to migrate.\n' : `Applied:\n  ${applied.join('\n  ')}\n`);
    } else if (command === 'status') {
      const { applied, pending } = await migrationStatus(pool);
      process.stdout.write(`Applied (${applied.length}):\n  ${applied.join('\n  ') || '-'}\nPending (${pending.length}):\n  ${pending.join('\n  ') || '-'}\n`);
    } else {
      throw new Error('Usage: migrate <up|status|new <name>>');
    }
  } finally {
    await pool.end();
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
