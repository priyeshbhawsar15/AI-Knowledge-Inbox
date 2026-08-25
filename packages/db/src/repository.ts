import type { DatabaseInstance } from './connection.js';
import {
  items,
  ingestionJobs,
  chunks,
  events,
  idempotencyKeys,
  systemState,
  workerState,
} from './schema.js';
import { eq, and, lte, sql, desc, or, isNull } from 'drizzle-orm';
import { generateId } from '@ai-knowledge-inbox/domain';
import type {
  ItemSummary,
  ItemDetail,
  IngestRequest,
  SafeError,
  ItemStatus,
  ErrorCode,
} from '@ai-knowledge-inbox/contracts';

export interface CreateItemOptions {
  request: IngestRequest;
  idempotencyKey?: string | undefined;
  requestHash: string;
  requestId?: string | undefined;
}

export interface IngestCreateResult {
  isReplay: boolean;
  item: ItemSummary;
  jobId: string;
}

export class Repository {
  constructor(private readonly db: DatabaseInstance) {}

  public createItemWithJob(options: CreateItemOptions): IngestCreateResult {
    const { request, idempotencyKey, requestHash, requestId } = options;
    const now = new Date().toISOString();

    const txn = this.db.$client.transaction(() => {
      // 1. Check idempotency key if provided
      if (idempotencyKey) {
        const existingKey = this.db
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.key, idempotencyKey))
          .get();

        if (existingKey) {
          const expTime = new Date(existingKey.expiresAt).getTime();
          if (expTime > Date.now()) {
            if (existingKey.requestHash !== requestHash) {
              const err = new Error('Idempotency key conflict');
              (err as unknown as Record<string, string>).code = 'IDEMPOTENCY_CONFLICT';
              throw err;
            }

            // Replay
            const existingItem = this.db
              .select()
              .from(items)
              .where(eq(items.id, existingKey.itemId))
              .get();

            if (existingItem) {
              return {
                isReplay: true,
                item: this.toItemSummary(existingItem),
                jobId: existingKey.jobId,
              };
            }
          }
        }
      }

      // 2. Create new item and job
      const itemId = generateId('itm');
      const jobId = generateId('job');
      const eventId = generateId('evt');

      const isText = request.type === 'text';
      const itemRow = {
        id: itemId,
        type: request.type,
        submittedText: isText ? request.content : null,
        sourceUrl: isText ? null : request.url,
        canonicalUrl: null,
        title: isText ? (request.title ?? null) : null,
        rawContent: null,
        contentHash: null,
        status: 'queued' as const,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      };

      this.db.insert(items).values(itemRow).run();

      const jobRow = {
        id: jobId,
        itemId,
        state: 'queued' as const,
        attempt: 0,
        maxAttempts: 3,
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now,
      };

      this.db.insert(ingestionJobs).values(jobRow).run();

      this.db
        .insert(events)
        .values({
          id: eventId,
          itemId,
          jobId,
          requestId: requestId ?? null,
          type: 'ingest.accepted',
          metadataJson: JSON.stringify({ type: request.type }),
          createdAt: now,
        })
        .run();

      if (idempotencyKey) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        this.db
          .insert(idempotencyKeys)
          .values({
            key: idempotencyKey,
            requestHash,
            itemId,
            jobId,
            expiresAt,
            createdAt: now,
          })
          .run();
      }

      return {
        isReplay: false,
        item: this.toItemSummary(itemRow),
        jobId,
      };
    });

    return txn();
  }

  public getItems(options: {
    cursor?: string | undefined;
    limit: number;
    status?: ItemStatus | undefined;
  }): { items: ItemSummary[]; nextCursor: string | null } {
    const { cursor, limit, status } = options;

    let query = this.db.select().from(items);

    const conditions = [];
    if (status) {
      conditions.push(eq(items.status, status));
    }

    if (cursor) {
      // cursor format: ISOString,id
      const parts = cursor.split(',');
      if (parts.length === 2 && parts[0] && parts[1]) {
        const [cCreated, cId] = parts;
        conditions.push(
          sql`(${items.createdAt} < ${cCreated} OR (${items.createdAt} = ${cCreated} AND ${items.id} < ${cId}))`
        );
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = query
      .orderBy(desc(items.createdAt), desc(items.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = resultRows[resultRows.length - 1];
      if (last) {
        nextCursor = `${last.createdAt},${last.id}`;
      }
    }

    return {
      items: resultRows.map((r) => this.toItemSummary(r)),
      nextCursor,
    };
  }

  public getItemById(id: string): ItemDetail | null {
    const item = this.db.select().from(items).where(eq(items.id, id)).get();
    if (!item) return null;

    const chunkCountResult = this.db
      .select({ count: sql<number>`count(*)` })
      .from(chunks)
      .where(eq(chunks.itemId, id))
      .get();

    const chunkCount = chunkCountResult?.count ?? 0;

    const summary = this.toItemSummary(item);
    return {
      ...summary,
      chunkCount,
      displayContent: item.submittedText ?? item.rawContent ?? null,
    };
  }

  public claimNextJob(workerId: string): { job: typeof ingestionJobs.$inferSelect; item: typeof items.$inferSelect } | null {
    const now = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + 60 * 1000).toISOString();

    const txn = this.db.$client.transaction(() => {
      const eligibleJob = this.db
        .select()
        .from(ingestionJobs)
        .where(
          and(
            or(eq(ingestionJobs.state, 'queued'), eq(ingestionJobs.state, 'retry_wait')),
            lte(ingestionJobs.availableAt, now),
            or(isNull(ingestionJobs.leaseExpiresAt), lte(ingestionJobs.leaseExpiresAt, now))
          )
        )
        .orderBy(ingestionJobs.createdAt)
        .get();

      if (!eligibleJob) return null;

      const nextAttempt = eligibleJob.attempt + 1;

      this.db
        .update(ingestionJobs)
        .set({
          state: 'running',
          attempt: nextAttempt,
          leaseOwner: workerId,
          leaseExpiresAt,
          heartbeatAt: now,
          updatedAt: now,
        })
        .where(eq(ingestionJobs.id, eligibleJob.id))
        .run();

      this.db
        .update(items)
        .set({
          status: 'processing',
          updatedAt: now,
        })
        .where(eq(items.id, eligibleJob.itemId))
        .run();

      this.db
        .insert(events)
        .values({
          id: generateId('evt'),
          itemId: eligibleJob.itemId,
          jobId: eligibleJob.id,
          type: 'ingest.started',
          metadataJson: JSON.stringify({ attempt: nextAttempt, workerId }),
          createdAt: now,
        })
        .run();

      const updatedJob = this.db
        .select()
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, eligibleJob.id))
        .get()!;

      const item = this.db
        .select()
        .from(items)
        .where(eq(items.id, eligibleJob.itemId))
        .get()!;

      return { job: updatedJob, item };
    });

    return txn();
  }

  public heartbeatJob(jobId: string, workerId: string): boolean {
    const now = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + 60 * 1000).toISOString();

    const res = this.db
      .update(ingestionJobs)
      .set({
        heartbeatAt: now,
        leaseExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(ingestionJobs.id, jobId),
          eq(ingestionJobs.leaseOwner, workerId),
          eq(ingestionJobs.state, 'running')
        )
      )
      .run();

    return res.changes > 0;
  }

  public reclaimExpiredLeases(): number {
    const now = new Date().toISOString();

    const txn = this.db.$client.transaction(() => {
      const expiredJobs = this.db
        .select()
        .from(ingestionJobs)
        .where(
          and(
            eq(ingestionJobs.state, 'running'),
            lte(ingestionJobs.leaseExpiresAt, now)
          )
        )
        .all();

      let reclaimedCount = 0;
      for (const job of expiredJobs) {
        this.db
          .update(ingestionJobs)
          .set({
            state: 'retry_wait',
            leaseOwner: null,
            leaseExpiresAt: null,
            availableAt: now,
            updatedAt: now,
          })
          .where(eq(ingestionJobs.id, job.id))
          .run();

        this.db
          .update(items)
          .set({
            status: 'retry_wait',
            updatedAt: now,
          })
          .where(eq(items.id, job.itemId))
          .run();

        reclaimedCount++;
      }
      return reclaimedCount;
    });

    return txn();
  }

  public recordJobRetry(
    jobId: string,
    itemId: string,
    code: string,
    message: string,
    availableAt: string
  ): void {
    const now = new Date().toISOString();
    const txn = this.db.$client.transaction(() => {
      this.db
        .update(ingestionJobs)
        .set({
          state: 'retry_wait',
          leaseOwner: null,
          leaseExpiresAt: null,
          availableAt,
          lastErrorCode: code,
          lastErrorMessage: message,
          updatedAt: now,
        })
        .where(eq(ingestionJobs.id, jobId))
        .run();

      this.db
        .update(items)
        .set({
          status: 'retry_wait',
          errorCode: code,
          errorMessage: message,
          updatedAt: now,
        })
        .where(eq(items.id, itemId))
        .run();

      this.db
        .insert(events)
        .values({
          id: generateId('evt'),
          itemId,
          jobId,
          type: 'ingest.retry_scheduled',
          metadataJson: JSON.stringify({ code, message, availableAt }),
          createdAt: now,
        })
        .run();
    });

    txn();
  }

  public recordJobFailure(
    jobId: string,
    itemId: string,
    code: string,
    message: string
  ): void {
    const now = new Date().toISOString();
    const txn = this.db.$client.transaction(() => {
      this.db
        .update(ingestionJobs)
        .set({
          state: 'failed',
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: code,
          lastErrorMessage: message,
          updatedAt: now,
        })
        .where(eq(ingestionJobs.id, jobId))
        .run();

      this.db
        .update(items)
        .set({
          status: 'failed',
          errorCode: code,
          errorMessage: message,
          updatedAt: now,
        })
        .where(eq(items.id, itemId))
        .run();

      this.db
        .insert(events)
        .values({
          id: generateId('evt'),
          itemId,
          jobId,
          type: 'ingest.failed',
          metadataJson: JSON.stringify({ code, message }),
          createdAt: now,
        })
        .run();
    });

    txn();
  }

  public publishItemChunks(options: {
    itemId: string;
    jobId: string;
    rawContent?: string | undefined;
    canonicalUrl?: string | undefined;
    title?: string | undefined;
    contentHash?: string | undefined;
    chunkData: Array<{
      ordinal: number;
      text: string;
      tokenCount: number;
      embedding: Buffer;
      embeddingModel: string;
      dimensions: number;
      contentHash: string;
    }>;
  }): void {
    const { itemId, jobId, rawContent, canonicalUrl, title, contentHash, chunkData } = options;
    const now = new Date().toISOString();

    const txn = this.db.$client.transaction(() => {
      // 1. Clear existing chunks
      this.db.delete(chunks).where(eq(chunks.itemId, itemId)).run();

      // 2. Insert new chunks
      for (const chk of chunkData) {
        this.db
          .insert(chunks)
          .values({
            id: generateId('chk'),
            itemId,
            ordinal: chk.ordinal,
            text: chk.text,
            tokenCount: chk.tokenCount,
            embedding: chk.embedding,
            embeddingModel: chk.embeddingModel,
            dimensions: chk.dimensions,
            contentHash: chk.contentHash,
            createdAt: now,
          })
          .run();
      }

      // 3. Update item
      const itemUpdate: Record<string, unknown> = {
        status: 'ready',
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      };
      if (rawContent !== undefined) itemUpdate['rawContent'] = rawContent;
      if (canonicalUrl !== undefined) itemUpdate['canonicalUrl'] = canonicalUrl;
      if (title !== undefined) itemUpdate['title'] = title;
      if (contentHash !== undefined) itemUpdate['contentHash'] = contentHash;

      this.db.update(items).set(itemUpdate).where(eq(items.id, itemId)).run();

      // 4. Update job
      this.db
        .update(ingestionJobs)
        .set({
          state: 'succeeded',
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(ingestionJobs.id, jobId))
        .run();

      // 5. Increment system_state.index_version
      this.db
        .update(systemState)
        .set({
          indexVersion: sql`${systemState.indexVersion} + 1`,
          updatedAt: now,
        })
        .where(eq(systemState.id, 1))
        .run();

      // 6. Record event
      this.db
        .insert(events)
        .values({
          id: generateId('evt'),
          itemId,
          jobId,
          type: 'ingest.succeeded',
          metadataJson: JSON.stringify({ chunkCount: chunkData.length }),
          createdAt: now,
        })
        .run();
    });

    txn();
  }

  public getReadyChunksForIndex(expectedModel?: string, expectedDimensions?: number): Array<{
    id: string;
    itemId: string;
    ordinal: number;
    text: string;
    embedding: Buffer;
    embeddingModel: string;
    dimensions: number;
    title: string | null;
    sourceUrl: string | null;
    canonicalUrl: string | null;
  }> {
    const rows = this.db
      .select({
        id: chunks.id,
        itemId: chunks.itemId,
        ordinal: chunks.ordinal,
        text: chunks.text,
        embedding: chunks.embedding,
        embeddingModel: chunks.embeddingModel,
        dimensions: chunks.dimensions,
        title: items.title,
        sourceUrl: items.sourceUrl,
        canonicalUrl: items.canonicalUrl,
      })
      .from(chunks)
      .innerJoin(items, eq(chunks.itemId, items.id))
      .where(eq(items.status, 'ready'))
      .all();

    if (expectedModel && expectedDimensions) {
      return rows.filter(
        (r) => r.embeddingModel === expectedModel && r.dimensions === expectedDimensions
      );
    }
    return rows;
  }

  public getLatestWorkerState(): typeof workerState.$inferSelect | undefined {
    return this.db
      .select()
      .from(workerState)
      .orderBy(desc(workerState.heartbeatAt))
      .limit(1)
      .get();
  }

  public getSystemState(): typeof systemState.$inferSelect | undefined {
    return this.db.select().from(systemState).where(eq(systemState.id, 1)).get();
  }

  public upsertWorkerState(workerId: string, version: string): void {
    const now = new Date().toISOString();
    const existing = this.db.select().from(workerState).where(eq(workerState.workerId, workerId)).get();
    if (existing) {
      this.db
        .update(workerState)
        .set({ heartbeatAt: now, version })
        .where(eq(workerState.workerId, workerId))
        .run();
    } else {
      this.db
        .insert(workerState)
        .values({
          workerId,
          heartbeatAt: now,
          startedAt: now,
          version,
        })
        .run();
    }
  }

  private toItemSummary(row: typeof items.$inferSelect): ItemSummary {
    let error: SafeError | null = null;
    if (row.errorCode && row.errorMessage) {
      error = {
        code: row.errorCode as ErrorCode,
        message: row.errorMessage,
        details: {},
      };
    }

    return {
      id: row.id,
      type: row.type as 'text' | 'url',
      title: row.title,
      sourceUrl: row.sourceUrl,
      status: row.status as ItemStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      error,
    };
  }
}
