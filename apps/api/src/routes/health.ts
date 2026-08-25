import { Router, type Request, type Response } from 'express';
import type { Repository } from '@ai-knowledge-inbox/db';
import type { HealthReadyResponse, HealthCheckItem } from '@ai-knowledge-inbox/contracts';

export function createHealthRouter(repository?: Repository): Router {
  const router = Router();

  router.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/ready', (_req: Request, res: Response) => {
    const timestamp = new Date().toISOString();
    const checks: Record<string, HealthCheckItem> = {};
    let isOk = true;

    if (repository) {
      try {
        const sysState = repository.getSystemState();
        if (sysState) {
          checks['database'] = { status: 'ok', message: 'SQLite writable and schema verified' };
        } else {
          isOk = false;
          checks['database'] = { status: 'error', message: 'System state uninitialized' };
        }
      } catch (err: unknown) {
        isOk = false;
        const msg = err instanceof Error ? err.message : 'Database error';
        checks['database'] = { status: 'error', message: msg };
      }
    } else {
      checks['database'] = { status: 'warn', message: 'Repository instance not injected' };
    }

    const payload: HealthReadyResponse = {
      status: isOk ? 'ok' : 'unavailable',
      timestamp,
      checks,
    };

    res.status(isOk ? 200 : 503).json(payload);
  });

  return router;
}
