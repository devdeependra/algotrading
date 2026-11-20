import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { ErrorRequestHandler, Express } from 'express';
import type { AppConfig } from '../config/index.js';
import type { ScryptParams } from '../crypto/password.js';
import type { UserRepository } from '../db/repositories/users.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';

export interface AppDeps {
  config: AppConfig;
  users: UserRepository;
  checkDb: () => Promise<boolean>;
  version: string;
  /** Directory of built UI assets to serve, if any. */
  staticDir?: string;
  scryptParams?: ScryptParams;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '64kb' }));

  const api = express.Router();
  api.use(healthRouter({ checkDb: deps.checkDb, version: deps.version }));
  api.use(authRouter({ config: deps.config, users: deps.users, ...(deps.scryptParams ? { scryptParams: deps.scryptParams } : {}) }));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use('/api', api);

  const staticDir = deps.staticDir;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: 'index.html' }));
    // SPA fallback: any other GET that wants HTML gets the app shell.
    app.get(/.*/, (req, res, next) => {
      if (!req.accepts('html')) return next();
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    // Log the type and message only. Never the body, headers, or raw error
    // payloads, which may carry credentials (hard rule 2).
    const name = err instanceof Error ? err.name : 'Error';
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
    if (status >= 500) console.error(`[api] ${name}: ${message}`);
    res.status(status).json({ error: status >= 500 ? 'Internal error' : message });
  };
  app.use(onError);

  return app;
}
