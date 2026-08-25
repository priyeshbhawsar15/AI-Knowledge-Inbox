import { z } from 'zod';

export const ErrorCodeEnum = z.enum([
  'VALIDATION_ERROR',
  'IDEMPOTENCY_CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'ITEM_NOT_FOUND',
  'NO_READY_CONTENT',
  'INDEX_MODEL_MISMATCH',
  'INDEX_UNAVAILABLE',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_RESPONSE',
  'URL_PRIVATE_ADDRESS',
  'URL_FETCH_TIMEOUT',
  'URL_FETCH_FAILED',
  'CONTENT_NOT_EXTRACTABLE',
  'RATE_LIMIT_EXCEEDED',
  'QUEUE_FULL',
  'DATABASE_BUSY',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

export const SafeErrorSchema = z.object({
  code: ErrorCodeEnum,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().optional(),
});

export type SafeError = z.infer<typeof SafeErrorSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: SafeErrorSchema,
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const ItemStatusSchema = z.enum(['queued', 'processing', 'ready', 'retry_wait', 'failed']);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const ItemTypeSchema = z.enum(['text', 'url']);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const ItemSummarySchema = z.object({
  id: z.string(),
  type: ItemTypeSchema,
  title: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  status: ItemStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  error: SafeErrorSchema.nullable(),
});

export type ItemSummary = z.infer<typeof ItemSummarySchema>;

export const ItemDetailSchema = ItemSummarySchema.extend({
  chunkCount: z.number().int().nonnegative(),
  displayContent: z.string().nullable(),
});

export type ItemDetail = z.infer<typeof ItemDetailSchema>;

export const ItemsListResponseSchema = z.object({
  items: z.array(ItemSummarySchema),
  nextCursor: z.string().nullable(),
});

export type ItemsListResponse = z.infer<typeof ItemsListResponseSchema>;

export const ItemsQueryParamSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: ItemStatusSchema.optional(),
});

export type ItemsQueryParams = z.infer<typeof ItemsQueryParamSchema>;

export const TextIngestSchema = z
  .object({
    type: z.literal('text'),
    content: z.string().min(1, 'Content is required').max(50000, 'Content exceeds 50,000 character limit'),
    title: z.string().max(256, 'Title exceeds 256 character limit').optional(),
  })
  .strict();

export const UrlIngestSchema = z
  .object({
    type: z.literal('url'),
    url: z.string().url('Invalid URL format').max(2048, 'URL exceeds 2,048 character limit'),
  })
  .strict();

export const IngestRequestSchema = z.discriminatedUnion('type', [
  TextIngestSchema,
  UrlIngestSchema,
]);

export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const IngestResponseSchema = z.object({
  item: ItemSummarySchema,
  jobId: z.string(),
  statusUrl: z.string(),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;

export const QueryRequestSchema = z
  .object({
    question: z.string().min(1, 'Question is required').max(2000, 'Question exceeds 2,000 character limit'),
    topK: z.number().int().min(1).max(10).default(5),
  })
  .strict();

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const CitationSourceSchema = z.object({
  citationId: z.string(),
  itemId: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  snippet: z.string(),
  score: z.number(),
});

export type CitationSource = z.infer<typeof CitationSourceSchema>;

export const QueryResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(CitationSourceSchema),
  requestId: z.string(),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export const HealthLiveResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
});

export type HealthLiveResponse = z.infer<typeof HealthLiveResponseSchema>;

export const HealthCheckItemSchema = z.object({
  status: z.enum(['ok', 'warn', 'error']),
  message: z.string().optional(),
});
export type HealthCheckItem = z.infer<typeof HealthCheckItemSchema>;

export const HealthReadyResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'unavailable']),
  timestamp: z.string(),
  checks: z.record(z.string(), HealthCheckItemSchema),
});

export type HealthReadyResponse = z.infer<typeof HealthReadyResponseSchema>;

export const IdempotencyKeyHeaderSchema = z.string().min(1).max(128);
