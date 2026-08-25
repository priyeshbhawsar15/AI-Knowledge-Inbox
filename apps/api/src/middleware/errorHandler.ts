import type { Request, Response, NextFunction } from 'express';
import type { SafeError, ErrorCode } from '@ai-knowledge-inbox/contracts';
import type { Logger } from 'pino';

export interface AppError extends Error {
  code?: ErrorCode | string;
  statusCode?: number;
  status?: number;
  type?: string;
  details?: Record<string, unknown>;
}

export function createErrorHandler(logger: Logger) {
  return (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.id;
    let statusCode = err.statusCode ?? 500;
    let code: ErrorCode = (err.code as ErrorCode) ?? 'INTERNAL_ERROR';
    let message = err.message || 'An unexpected internal error occurred.';
    let details: Record<string, unknown> = err.details ?? {};

    if (err.type === 'entity.too.large' || err.statusCode === 413 || err.status === 413) {
      statusCode = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request payload exceeds maximum allowed size limit of 256 KiB.';
    } else if (err.name === 'SyntaxError' && 'body' in err) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Malformed JSON body';
    } else if (code === 'IDEMPOTENCY_CONFLICT') {
      statusCode = 409;
    } else if (code === 'VALIDATION_ERROR') {
      statusCode = 400;
    } else if (code === 'PAYLOAD_TOO_LARGE') {
      statusCode = 413;
    } else if (code === 'ITEM_NOT_FOUND') {
      statusCode = 404;
    } else if (code === 'NO_READY_CONTENT') {
      statusCode = 422;
    } else if (code === 'INDEX_MODEL_MISMATCH') {
      statusCode = 409;
    } else if (code === 'INDEX_UNAVAILABLE' || code === 'DATABASE_BUSY') {
      statusCode = 503;
    } else if (code === 'RATE_LIMIT_EXCEEDED' || code === 'QUEUE_FULL') {
      statusCode = 429;
    } else if (code === 'AI_PROVIDER_ERROR' || code === 'AI_INVALID_RESPONSE') {
      statusCode = 502;
    }

    if (statusCode >= 500) {
      logger.error({ err, requestId, url: req.originalUrl }, 'Unhandled application error');
      if (process.env['NODE_ENV'] === 'production') {
        message = 'An unexpected internal server error occurred.';
        details = {};
      }
    } else {
      logger.warn({ code, statusCode, requestId, url: req.originalUrl, message }, 'Application client error');
    }

    const safeError: SafeError = {
      code,
      message,
      details,
      requestId,
    };

    res.status(statusCode).json({ error: safeError });
  };
}
