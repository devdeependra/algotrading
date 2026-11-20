import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './api/app.js';
import { loadDotEnv } from './config/dotenv.js';
import { loadConfig } from './config/index.js';
import { checkDatabase, createPool } from './db/pool.js';
import { PgUserRepository } from './db/repositories/users.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..');

loadDotEnv(join(rootDir, '.env'));
const config = loadConfig();

const { version } = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { version: string };

const pool = createPool(config.databaseUrl);
const app = createApp({
  config,
  users: new PgUserRepository(pool),
  checkDb: () => checkDatabase(pool),
  version,
  staticDir: join(rootDir, 'ui', 'dist'),
});

const server = app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down`);
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
