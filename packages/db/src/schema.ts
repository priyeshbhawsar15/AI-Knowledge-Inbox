import { sqliteTable, text, integer, blob, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['text', 'url'] }).notNull(),
    submittedText: text('submitted_text'),
    sourceUrl: text('source_url'),
    canonicalUrl: text('canonical_url'),
    title: text('title'),
    rawContent: text('raw_content'),
    contentHash: text('content_hash'),
    status: text('status', { enum: ['queued', 'processing', 'ready', 'retry_wait', 'failed'] }).notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('type_check', sql`${table.type} IN ('text', 'url')`),
    check('status_check', sql`${table.status} IN ('queued', 'processing', 'ready', 'retry_wait', 'failed')`),
    index('idx_items_created_id').on(table.createdAt, table.id),
    index('idx_items_status').on(table.status),
  ]
);

export const ingestionJobs = sqliteTable(
  'ingestion_jobs',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .unique()
      .references(() => items.id, { onDelete: 'cascade' }),
    state: text('state', { enum: ['queued', 'running', 'retry_wait', 'succeeded', 'failed'] }).notNull(),
    attempt: integer('attempt').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: text('available_at').notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: text('lease_expires_at'),
    heartbeatAt: text('heartbeat_at'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('state_check', sql`${table.state} IN ('queued', 'running', 'retry_wait', 'succeeded', 'failed')`),
    index('idx_jobs_state_avail').on(table.state, table.availableAt),
  ]
);

export const chunks = sqliteTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    tokenCount: integer('token_count').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }).notNull(),
    embeddingModel: text('embedding_model').notNull(),
    dimensions: integer('dimensions').notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_chunks_item_ordinal').on(table.itemId, table.ordinal),
    index('idx_chunks_item').on(table.itemId),
  ]
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').references(() => items.id, { onDelete: 'set null' }),
    jobId: text('job_id').references(() => ingestionJobs.id, { onDelete: 'set null' }),
    requestId: text('request_id'),
    type: text('type').notNull(),
    metadataJson: text('metadata_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_events_item').on(table.itemId),
    index('idx_events_job').on(table.jobId),
    index('idx_events_created').on(table.createdAt),
  ]
);

export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    requestHash: text('request_hash').notNull(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_idempotency_expires').on(table.expiresAt)]
);

export const systemState = sqliteTable(
  'system_state',
  {
    id: integer('id').primaryKey(),
    schemaVersion: integer('schema_version').notNull(),
    indexVersion: integer('index_version').notNull().default(1),
    embeddingModel: text('embedding_model').notNull(),
    embeddingDimensions: integer('embedding_dimensions').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('singleton_check', sql`${table.id} = 1`)]
);

export const workerState = sqliteTable('worker_state', {
  workerId: text('worker_id').primaryKey(),
  heartbeatAt: text('heartbeat_at').notNull(),
  startedAt: text('started_at').notNull(),
  version: text('version').notNull(),
});
