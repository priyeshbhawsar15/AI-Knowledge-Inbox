import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { createDatabase, migrateDatabase, Repository, type DatabaseInstance } from '@ai-knowledge-inbox/db';
import { loadConfig } from '@ai-knowledge-inbox/config';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { OpenAIClient, VectorIndex, startFakeAIServer, type FakeProviderServer } from '@ai-knowledge-inbox/ai';
import { QueryService } from '../../apps/api/src/services/queryService.js';
import { WorkerRunner } from '../../apps/worker/src/runner.js';
import { hashIngestRequest } from '@ai-knowledge-inbox/domain';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('RAG Query Pipeline Integration Tests', () => {
  let fakeAI: FakeProviderServer;
  let dbFile: string;
  let db: DatabaseInstance;
  let repo: Repository;
  let queryService: QueryService;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    fakeAI = await startFakeAIServer();
    dbFile = join(tmpdir(), `test-query-${Date.now()}-${Math.random().toString(36).substring(2)}.db`);
    db = createDatabase(dbFile);
    migrateDatabase(db, { embeddingModel: 'text-embedding-3-small', embeddingDimensions: 1536 });
    repo = new Repository(db);

    const config = loadConfig({
      AI_BASE_URL: fakeAI.baseUrl,
      QUERY_RATE_LIMIT_PER_MIN: '100',
      MIN_RELEVANCE_SCORE: '0.0',
    });
    const logger = createLogger({ level: 'silent' });

    const aiClient = new OpenAIClient({
      baseURL: fakeAI.baseUrl,
      apiKey: 'test-key',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      chatModel: 'gpt-4o-mini',
      logger,
    });

    const vectorIndex = new VectorIndex({
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      logger,
    });

    queryService = new QueryService({
      config,
      logger,
      repository: repo,
      aiClient,
      vectorIndex,
    });

    app = createApp({ config, logger, repository: repo, queryService });
  });

  afterEach(async () => {
    await fakeAI.close();
    db.$client.close();
    if (existsSync(dbFile)) unlinkSync(dbFile);
    if (existsSync(`${dbFile}-wal`)) unlinkSync(`${dbFile}-wal`);
    if (existsSync(`${dbFile}-shm`)) unlinkSync(`${dbFile}-shm`);
  });

  it('POST /query returns 422 NO_READY_CONTENT when database is empty', async () => {
    const res = await request(app)
      .post('/query')
      .send({ question: 'What did I save about rate limits?' })
      .expect(422);

    expect(res.body.error.code).toBe('NO_READY_CONTENT');
  });

  it('POST /query ingests note, processes worker, and returns grounded cited answer', async () => {
    const logger = createLogger({ level: 'silent' });
    const aiClient = new OpenAIClient({
      baseURL: fakeAI.baseUrl,
      apiKey: 'test-key',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      chatModel: 'gpt-4o-mini',
    });

    const req = {
      type: 'text' as const,
      content: 'The system uses exponential backoff and jitter for handling rate limits.',
      title: 'Rate Limit Note',
    };
    const hash = hashIngestRequest(req);
    const { item } = repo.createItemWithJob({ request: req, requestHash: hash });

    const runner = new WorkerRunner({
      workerId: 'w-query-test',
      repository: repo,
      embeddingProvider: aiClient,
      logger,
    });
    await runner.runOnce();

    const res = await request(app)
      .post('/query')
      .send({ question: 'What did I save about rate limiting?' })
      .expect(200);

    expect(res.body).toHaveProperty('answer');
    expect(res.body.answer).toContain('exponential backoff');
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].itemId).toBe(item.id);
    expect(res.body.sources[0].title).toBe('Rate Limit Note');
    expect(res.body.sources[0].citationId).toBe('S1');
  });

  it('POST /query rejects invalid question payload with 400', async () => {
    await request(app)
      .post('/query')
      .send({ question: '' })
      .expect(400);

    await request(app)
      .post('/query')
      .send({ question: 'a'.repeat(2001) })
      .expect(400);
  });

  it('strictly validates citation schema, allowlist, duplicates, and tag agreement', () => {
    const allowlisted = new Set(['S1', 'S2']);

    // 1. Valid response
    const validRes = queryService.validateModelResponse(
      JSON.stringify({ answer: 'Here is information [S1] and [S2].', citations: ['S1', 'S2'] }),
      allowlisted
    );
    expect(validRes.valid).toBe(true);

    // 2. Unknown citation in array
    const unknownArr = queryService.validateModelResponse(
      JSON.stringify({ answer: 'Info [S1].', citations: ['S1', 'S99'] }),
      allowlisted
    );
    expect(unknownArr.valid).toBe(false);
    if (!unknownArr.valid) expect(unknownArr.reason).toContain('Unknown citation ID "S99"');

    // 3. Unknown citation in text tags
    const unknownTag = queryService.validateModelResponse(
      JSON.stringify({ answer: 'Info [S99].', citations: ['S1'] }),
      allowlisted
    );
    expect(unknownTag.valid).toBe(false);
    if (!unknownTag.valid) expect(unknownTag.reason).toContain('Unknown citation ID "S99"');

    // 4. Duplicate citation in array
    const duplicateArr = queryService.validateModelResponse(
      JSON.stringify({ answer: 'Info [S1].', citations: ['S1', 'S1'] }),
      allowlisted
    );
    expect(duplicateArr.valid).toBe(false);
    if (!duplicateArr.valid) expect(duplicateArr.reason).toContain('Duplicate citation ID');

    // 5. Disagreement between tags and array
    const disagreement = queryService.validateModelResponse(
      JSON.stringify({ answer: 'Info [S1].', citations: ['S1', 'S2'] }),
      allowlisted
    );
    expect(disagreement.valid).toBe(false);
    if (!disagreement.valid) expect(disagreement.reason).toContain('Disagreement between citations array count');
  });
});
