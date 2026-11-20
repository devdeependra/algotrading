import { Router } from 'express';

export interface HealthDeps {
  checkDb: () => Promise<boolean>;
  version: string;
}

export function healthRouter({ checkDb, version }: HealthDeps): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const db = await checkDb();
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      db: db ? 'ok' : 'unavailable',
      version,
      time: new Date().toISOString(),
    });
  });
  return router;
}
