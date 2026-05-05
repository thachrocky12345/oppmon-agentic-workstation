import { Router, Request, Response } from 'express';
import { healthCheck } from '../lib/db.js';

export const healthRouter = Router();

healthRouter.get('/', async (req: Request, res: Response) => {
  const dbHealthy = await healthCheck();

  const status = {
    status: dbHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: dbHealthy ? 'ok' : 'error',
    },
  };

  res.status(dbHealthy ? 200 : 503).json(status);
});

healthRouter.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/ready', async (req: Request, res: Response) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    ready: dbHealthy,
    checks: { database: dbHealthy },
  });
});
