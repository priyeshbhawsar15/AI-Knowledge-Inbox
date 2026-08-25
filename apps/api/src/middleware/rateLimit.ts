import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { SafeError } from '@ai-knowledge-inbox/contracts';

export function createIngestRateLimiter(maxPerMin: number = 10) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMin,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const error: SafeError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many ingestion requests. Please try again later.',
        details: { limit: maxPerMin, windowMs: 60000 },
        requestId: req.id,
      };
      res.status(429).json({ error });
    },
  });
}

export function createQueryRateLimiter(maxPerMin: number = 30) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMin,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const error: SafeError = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many query requests. Please try again later.',
        details: { limit: maxPerMin, windowMs: 60000 },
        requestId: req.id,
      };
      res.status(429).json({ error });
    },
  });
}
