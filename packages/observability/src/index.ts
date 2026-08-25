import pino, { type Logger, type LoggerOptions } from 'pino';

export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'authorization',
  'api_key',
  'apiKey',
  'AI_API_KEY',
  'content',
  'submittedText',
  'rawContent',
  'prompt',
  'embedding',
  'embeddings',
  'vector',
  'vectors',
  'body.content',
  'body.url',
  'query.question',
];

export function createLogger(options?: { name?: string; level?: string }): Logger {
  const pinoOptions: LoggerOptions = {
    name: options?.name ?? 'ai-knowledge-inbox',
    level: options?.level ?? process.env['LOG_LEVEL'] ?? 'info',
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]',
    },
    base: {
      env: process.env['NODE_ENV'] ?? 'development',
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(pinoOptions);
}

export function sanitizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '[INVALID_URL]';
  }
}
