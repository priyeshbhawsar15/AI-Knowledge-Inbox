import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabase,
  migrateDatabase,
  Repository,
  encodeVector,
  decodeVector,
  cosineSimilarity,
  type DatabaseInstance,
} from '@ai-knowledge-inbox/db';
import { hashIngestRequest } from '@ai-knowledge-inbox/domain';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Database Integration Tests', () => {
  let dbFile: string;
  let db: DatabaseInstance;
  let repo: Repository;

  beforeEach(() => {
    dbFile = join(tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).substring(2)}.db`);
    db = createDatabase(dbFile);
    migrateDatabase(db);
    repo = new Repository(db);
  });

  afterEach(() => {
    db.$client.close();
    if (existsSync(dbFile)) unlinkSync(dbFile);
    if (existsSync(`${dbFile}-wal`)) unlinkSync(`${dbFile}-wal`);
    if (existsSync(`${dbFile}-shm`)) unlinkSync(`${dbFile}-shm`);
  });

  it('runs PRAGMA integrity_check on migrated database', () => {
    const result = db.$client.pragma('integrity_check');
    expect(result).toEqual([{ integrity_check: 'ok' }]);
  });

  it('handles migrations on already-migrated database idempotently', () => {
    expect(() => migrateDatabase(db)).not.toThrow();
  });

  it('atomically creates item, job, and idempotency key', () => {
    const req = { type: 'text' as const, content: 'Test note', title: 'Title' };
    const hash = hashIngestRequest(req);
    const result = repo.createItemWithJob({
      request: req,
      idempotencyKey: 'key-123',
      requestHash: hash,
    });

    expect(result.isReplay).toBe(false);
    expect(result.item.id).toMatch(/^itm_/);
    expect(result.jobId).toMatch(/^job_/);

    // Replay same key and same body
    const replay = repo.createItemWithJob({
      request: req,
      idempotencyKey: 'key-123',
      requestHash: hash,
    });
    expect(replay.isReplay).toBe(true);
    expect(replay.item.id).toBe(result.item.id);

    // Conflict same key and different body
    const diffReq = { type: 'text' as const, content: 'Different note' };
    const diffHash = hashIngestRequest(diffReq);
    expect(() =>
      repo.createItemWithJob({
        request: diffReq,
        idempotencyKey: 'key-123',
        requestHash: diffHash,
      })
    ).toThrow('Idempotency key conflict');
  });

  it('claims jobs atomically and reclaims expired leases', () => {
    const req = { type: 'text' as const, content: 'Test note' };
    const hash = hashIngestRequest(req);
    repo.createItemWithJob({ request: req, requestHash: hash });

    const claimed = repo.claimNextJob('worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed?.job.state).toBe('running');
    expect(claimed?.job.leaseOwner).toBe('worker-1');

    // Second claim finds nothing
    const emptyClaim = repo.claimNextJob('worker-2');
    expect(emptyClaim).toBeNull();

    // Expire lease manually by modifying leaseExpiresAt in past
    db.$client.exec(`UPDATE ingestion_jobs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = '${claimed!.job.id}'`);

    const reclaimed = repo.reclaimExpiredLeases();
    expect(reclaimed).toBe(1);

    // Now worker-2 can claim it
    const reclaimClaim = repo.claimNextJob('worker-2');
    expect(reclaimClaim).not.toBeNull();
    expect(reclaimClaim?.job.leaseOwner).toBe('worker-2');
  });

  it('publishes item chunks atomically and increments index_version', () => {
    const req = { type: 'text' as const, content: 'Test note' };
    const hash = hashIngestRequest(req);
    const { item, jobId } = repo.createItemWithJob({ request: req, requestHash: hash });
    repo.claimNextJob('worker-1');

    const initialState = repo.getSystemState();
    expect(initialState?.indexVersion).toBe(1);

    const v1 = [0.1, 0.2, 0.3, 0.4];
    const encoded = encodeVector(v1, 4);

    repo.publishItemChunks({
      itemId: item.id,
      jobId,
      chunkData: [
        {
          ordinal: 0,
          text: 'Chunk 1 text',
          tokenCount: 3,
          embedding: encoded,
          embeddingModel: 'text-embedding-3-small',
          dimensions: 4,
          contentHash: 'hash1',
        },
      ],
    });

    const updatedItem = repo.getItemById(item.id);
    expect(updatedItem?.status).toBe('ready');
    expect(updatedItem?.chunkCount).toBe(1);

    const updatedState = repo.getSystemState();
    expect(updatedState?.indexVersion).toBe(2);

    const readyChunks = repo.getReadyChunksForIndex('text-embedding-3-small', 4);
    expect(readyChunks).toHaveLength(1);
    expect(readyChunks[0]?.text).toBe('Chunk 1 text');
  });

  it('encodes, decodes, and computes cosine similarity correctly', () => {
    const raw = [1.0, 0.0, 0.0];
    const encoded = encodeVector(raw, 3);
    const decoded = decodeVector(encoded, 3);

    expect(decoded.length).toBe(3);
    const sim = cosineSimilarity(decoded, decoded);
    expect(sim).toBeCloseTo(1.0);

    const orthogonal = decodeVector(encodeVector([0.0, 1.0, 0.0], 3), 3);
    expect(cosineSimilarity(decoded, orthogonal)).toBeCloseTo(0.0);
  });

  it('detects corrupted vector buffers', () => {
    const corruptBuffer = Buffer.from([1, 2, 3]); // length 3, not multiple of 4
    expect(() => decodeVector(corruptBuffer, 3)).toThrow(/Corrupt vector buffer/);
  });
});
