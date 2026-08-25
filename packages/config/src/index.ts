import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_PATH: z.string().default('./knowledge.db'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    AI_API_KEY: z.string().default('sk-placeholder-do-not-use'),
    EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
    CHAT_MODEL: z.string().default('gpt-4o-mini'),
    MIN_RELEVANCE_SCORE: z.coerce.number().min(0).max(1).default(0.3),
    INGEST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
    QUERY_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const key = data.AI_API_KEY ? data.AI_API_KEY.trim() : '';
      if (!key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AI_API_KEY is required in production mode',
          path: ['AI_API_KEY'],
        });
        return;
      }

      const lower = key.toLowerCase();
      const isPlaceholder =
        lower.includes('placeholder') ||
        lower.includes('change-me') ||
        lower.includes('your_api_key') ||
        lower.includes('your-api-key') ||
        lower === 'dummy' ||
        lower === 'test';

      if (isPlaceholder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AI_API_KEY cannot be a placeholder or test default in production mode',
          path: ['AI_API_KEY'],
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuration validation failed: ${JSON.stringify(result.error.format())}`);
  }
  return Object.freeze(result.data);
}

export function getSanitizedConfig(config: Config): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...config };
  sanitized['AI_API_KEY'] = '[REDACTED]';
  return sanitized;
}
