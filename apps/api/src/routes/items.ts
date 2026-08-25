import { Router, type Request, type Response, type NextFunction } from 'express';
import { ItemsQueryParamSchema } from '@ai-knowledge-inbox/contracts';
import type { Repository } from '@ai-knowledge-inbox/db';
import type { AppError } from '../middleware/errorHandler.js';

export function createItemsRouter(repository: Repository): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ItemsQueryParamSchema.safeParse(req.query);
      if (!parsed.success) {
        const err: AppError = new Error('Invalid items query parameters');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        err.details = parsed.error.format();
        throw err;
      }

      const { cursor, limit, status } = parsed.data;
      const result = repository.getItems({ cursor, limit, status });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params['id'];
      const id = typeof rawId === 'string' ? rawId : undefined;
      if (!id) {
        const err: AppError = new Error('Item ID required');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }

      const itemDetail = repository.getItemById(id);
      if (!itemDetail) {
        const err: AppError = new Error(`Item ${id} not found`);
        err.code = 'ITEM_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      res.status(200).json(itemDetail);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
