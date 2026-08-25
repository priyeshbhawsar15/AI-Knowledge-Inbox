import { Router, type Request, type Response, type NextFunction } from 'express';
import { QueryRequestSchema } from '@ai-knowledge-inbox/contracts';
import type { QueryService } from '../services/queryService.js';
import type { AppError } from '../middleware/errorHandler.js';

export function createQueryRouter(queryService: QueryService): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = QueryRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const err: AppError = new Error('Invalid query payload');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        err.details = parsed.error.format();
        throw err;
      }

      const { question, topK } = parsed.data;
      const response = await queryService.query(question, topK, req.id);

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
