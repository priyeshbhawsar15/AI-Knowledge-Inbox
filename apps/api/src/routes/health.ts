import { Router, type Request, type Response } from 'express';
import type { Repository } from '@ai-knowledge-inbox/db';
import type { VectorIndex } from '@ai-knowledge-inbox/ai';
import type { Config } from '@ai-knowledge-inbox/config';
import type { HealthReadyResponse, HealthCheckItem } from '@ai-knowledge-inbox/contracts';

export interface HealthRouterOptions {
  repository?: Repository | undefined;
  vectorIndex?: VectorIndex | undefined;
  config?: Config | undefined;
}

function isRepository(obj: unknown): obj is Repository {
  return typeof obj === 'object' && obj !== null && 'getSystemState' in obj;
}

export function createHealthRouter(options?: HealthRouterOptions | Repository): Router {
  const router = Router();

  const repository = isRepository(options) ? options : options?.repository;
  const vectorIndex = isRepository(options) ? undefined : options?.vectorIndex;
  const config = isRepository(options) ? undefined : options?.config;

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
          checks['database'] = { status: 'ok', message: 'SQLite writable and schema current' };

          if (config) {
            if (
              sysState.embeddingModel !== config.EMBEDDING_MODEL ||
              sysState.embeddingDimensions !== config.EMBEDDING_DIMENSIONS
            ) {
              isOk = false;
              checks['modelConfig'] = {
                status: 'error',
                message: `Configured model (${config.EMBEDDING_MODEL}/${config.EMBEDDING_DIMENSIONS}) differs from DB schema (${sysState.embeddingModel}/${sysState.embeddingDimensions})`,
              };
            } else {
              checks['modelConfig'] = { status: 'ok', message: 'Embedding model and dimensions compatible' };
            }
          }
        } else {
          isOk = false;
          checks['database'] = { status: 'error', message: 'System state uninitialized' };
        }

        // Check worker heartbeat recency (<= 60s)
        const latestWorker = repository.getLatestWorkerState();
        if (latestWorker && latestWorker.heartbeatAt) {
          const ageMs = Date.now() - new Date(latestWorker.heartbeatAt).getTime();
          if (ageMs <= 60000) {
            checks['worker'] = { status: 'ok', message: `Worker active (heartbeat ${Math.round(ageMs / 1000)}s ago)` };
          } else {
            isOk = false;
            checks['worker'] = { status: 'error', message: `Worker heartbeat stale (${Math.round(ageMs / 1000)}s ago)` };
          }
        } else {
          isOk = false;
          checks['worker'] = { status: 'error', message: 'No active worker heartbeat found' };
        }
      } catch (err: unknown) {
        isOk = false;
        const msg = err instanceof Error ? err.message : 'Database error';
        checks['database'] = { status: 'error', message: msg };
      }
    } else {
      checks['database'] = { status: 'warn', message: 'Repository instance not injected' };
    }

    if (vectorIndex) {
      if (vectorIndex.isReady()) {
        checks['vectorIndex'] = {
          status: 'ok',
          message: `Index loaded and ready with ${vectorIndex.getCount()} vectors (v${vectorIndex.getVersion()})`,
        };
      } else {
        isOk = false;
        checks['vectorIndex'] = { status: 'error', message: 'Vector index is uninitialized or loading' };
      }
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
