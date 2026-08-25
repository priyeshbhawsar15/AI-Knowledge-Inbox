import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { createDatabase, migrateDatabase, Repository, type DatabaseInstance } from '@ai-knowledge-inbox/db';
import { loadConfig } from '@ai-knowledge-inbox/config';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Express Ingest & Item API Integration Tests', () => {
  let dbFile: string;
  let db: DatabaseInstance;
  let repo: Repository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dbFile = join(tmpdir(), `test-api-${Date.now()}-${Math.random().toString(36).substring(2)}.db`);
    db = createDatabase(dbFile);
    migrateDatabase(db);
    repo = new Repository(db);
    const config = loadConfig({ INGEST_RATE_LIMIT_PER_MIN: '100' });
    const logger = createLogger({ level: 'silent' });
    app = createApp({ config, logger, repository: repo });
  });

  afterEach(() => {
    db.$client.close();
    if (existsSync(dbFile)) unlinkSync(dbFile);
    if (existsSync(`${dbFile}-wal`)) unlinkSync(`${dbFile}-wal`);
    if (existsSync(`${dbFile}-shm`)) unlinkSync(`${dbFile}-shm`);
  });

  it('POST /ingest accepts valid text note and returns 202', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({ type: 'text', content: 'My note content', title: 'Note Title' })
      .expect(202);

    expect(res.body).toHaveProperty('item');
    expect(res.body.item.id).toMatch(/^itm_/);
    expect(res.body.item.status).toBe('queued');
    expect(res.body.jobId).toMatch(/^job_/);
    expect(res.body.statusUrl).toBe(`/items/${res.body.item.id}`);
  });

  it('POST /ingest accepts valid URL note and returns 202', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({ type: 'url', url: 'https://example.com/article' })
      .expect(202);

    expect(res.body.item.type).toBe('url');
    expect(res.body.item.sourceUrl).toBe('https://example.com/article');
  });

  it('POST /ingest handles Idempotency-Key replay and conflict', async () => {
    const key = 'test-key-1';
    const payload = { type: 'text', content: 'Note 1' };

    const first = await request(app)
      .post('/ingest')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);

    const replay = await request(app)
      .post('/ingest')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);

    expect(replay.body.item.id).toBe(first.body.item.id);

    const conflict = await request(app)
      .post('/ingest')
      .set('Idempotency-Key', key)
      .send({ type: 'text', content: 'Different Note' })
      .expect(409);

    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('POST /ingest rejects validation errors with 400', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({ type: 'text', content: '' }) // empty content
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /ingest rejects payload larger than 256kb with 413', async () => {
    const largeContent = 'a'.repeat(260 * 1024);
    const res = await request(app)
      .post('/ingest')
      .send({ type: 'text', content: largeContent })
      .expect(413);

    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('GET /items lists items with cursor pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/ingest').send({ type: 'text', content: `Note ${i}` });
    }

    const res = await request(app).get('/items?limit=3').expect(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.nextCursor).not.toBeNull();

    // Verify raw content and vectors are NOT in item list summaries
    const firstItem = res.body.items[0];
    expect(firstItem).not.toHaveProperty('submittedText');
    expect(firstItem).not.toHaveProperty('rawContent');
    expect(firstItem).not.toHaveProperty('embedding');

    // Fetch next page with cursor
    const res2 = await request(app)
      .get(`/items?limit=3&cursor=${encodeURIComponent(res.body.nextCursor)}`)
      .expect(200);

    expect(res2.body.items).toHaveLength(2);
  });

  it('GET /items/:id returns item detail and 404 for missing item', async () => {
    const ing = await request(app)
      .post('/ingest')
      .send({ type: 'text', content: 'Detailed note content' })
      .expect(202);

    const detail = await request(app).get(`/items/${ing.body.item.id}`).expect(200);
    expect(detail.body.id).toBe(ing.body.item.id);
    expect(detail.body.chunkCount).toBe(0);
    expect(detail.body.displayContent).toBe('Detailed note content');

    await request(app).get('/items/itm_nonexistent').expect(404);
  });

  it('GET /health/live and /health/ready return health responses', async () => {
    await request(app).get('/health/live').expect(200);
    const ready = await request(app).get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
  });
});
