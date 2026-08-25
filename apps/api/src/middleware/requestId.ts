/* eslint-disable @typescript-eslint/no-namespace */
import type { Request, Response, NextFunction } from 'express';
import { generateId } from '@ai-knowledge-inbox/domain';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const reqId = incomingId && /^[a-zA-Z0-9_-]{1,64}$/.test(incomingId) ? incomingId : generateId('req');
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}
