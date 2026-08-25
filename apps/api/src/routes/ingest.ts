import { Router, type Request, type Response, type NextFunction } from 'express';
import { IngestRequestSchema, IdempotencyKeyHeaderSchema } from '@ai-knowledge-inbox/contracts';
import { hashIngestRequest } from '@ai-knowledge-inbox/domain';
import type { Repository } from '@ai-knowledge-inbox/db';
import type { AppError } from '../middleware/errorHandler.js';

export function createIngestRouter(repository: Repository): Router {
  const router = Router();

  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawIdempotencyKey = req.header('idempotency-key');
      let idempotencyKey: string | undefined;

      if (rawIdempotencyKey) {
        const idpParse = IdempotencyKeyHeaderSchema.safeParse(rawIdempotencyKey);
        if (!idpParse.success) {
          const err: AppError = new Error('Invalid Idempotency-Key header format');
          err.code = 'VALIDATION_ERROR';
          err.statusCode = 400;
          err.details = idpParse.error.format();
          throw err;
        }
        idempotencyKey = idpParse.data;
      }

      const bodyParse = IngestRequestSchema.safeParse(req.body);
      if (!bodyParse.success) {
        const err: AppError = new Error('Invalid ingest request payload');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        err.details = bodyParse.error.format();
        throw err;
      }

      const request = bodyParse.data;
      const requestHash = hashIngestRequest(request);

      const result = repository.createItemWithJob({
        request,
        idempotencyKey,
        requestHash,
        requestId: req.id,
      });

      res.status(202).json({
        item: result.item,
        jobId: result.jobId,
        statusUrl: `/items/${result.item.id}`,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
