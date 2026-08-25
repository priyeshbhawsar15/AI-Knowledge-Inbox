import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Config } from '@ai-knowledge-inbox/config';
import type { Repository } from '@ai-knowledge-inbox/db';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createIngestRateLimiter, createQueryRateLimiter } from './middleware/rateLimit.js';
import { createIngestRouter } from './routes/ingest.js';
import { createItemsRouter } from './routes/items.js';
import { createHealthRouter } from './routes/health.js';
import { createQueryRouter } from './routes/query.js';
import type { QueryService } from './services/queryService.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VectorIndex } from '@ai-knowledge-inbox/ai';

export interface AppDependencies {
  config: Config;
  logger: Logger;
  repository: Repository;
  vectorIndex?: VectorIndex | undefined;
  queryService?: QueryService | undefined;
  queryHandler?: express.RequestHandler | undefined;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const { logger, repository } = deps;

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(cors());
  app.use(requestIdMiddleware);

  // 256 KiB body limit strictly enforced
  app.use(express.json({ limit: '256kb' }));

  // Pino request completion logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const reqPath = req.baseUrl ? req.baseUrl + req.path : req.path;
      logger.info(
        {
          requestId: req.id,
          method: req.method,
          path: reqPath,
          status: res.statusCode,
          durationMs,
        },
        'HTTP Request'
      );
    });
    next();
  });

  // Health routes
  app.use(
    '/health',
    createHealthRouter({
      repository,
      vectorIndex: deps.vectorIndex,
      config: deps.config,
    })
  );

  // Ingest route with rate limit
  const ingestLimiter = createIngestRateLimiter(deps.config.INGEST_RATE_LIMIT_PER_MIN);
  app.use('/ingest', ingestLimiter, createIngestRouter(repository));

  // Items route
  app.use('/items', createItemsRouter(repository));

  // Query route with rate limit
  const queryLimiter = createQueryRateLimiter(deps.config.QUERY_RATE_LIMIT_PER_MIN);
  if (deps.queryService) {
    app.use('/query', queryLimiter, createQueryRouter(deps.queryService));
  } else if (deps.queryHandler) {
    app.post('/query', queryLimiter, deps.queryHandler);
  } else {
    app.post('/query', queryLimiter, (_req, res) => {
      res.status(503).json({
        error: {
          code: 'INDEX_UNAVAILABLE',
          message: 'Query service is initializing or unavailable.',
          details: {},
        },
      });
    });
  }

  // Static web assets if present
  const webDistPath = join(process.cwd(), 'apps', 'web', 'dist');
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get('*', (_req, res, next) => {
      if (_req.path.startsWith('/items') || _req.path.startsWith('/ingest') || _req.path.startsWith('/query') || _req.path.startsWith('/health')) {
        return next();
      }
      res.sendFile(join(webDistPath, 'index.html'));
    });
  }

  // App error handler
  app.use(createErrorHandler(logger));

  return app;
}
