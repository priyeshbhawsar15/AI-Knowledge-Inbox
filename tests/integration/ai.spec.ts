import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  OpenAIClient,
  VectorIndex,
  startFakeAIServer,
  type FakeProviderServer,
} from '@ai-knowledge-inbox/ai';
import {
  createDatabase,
  migrateDatabase,
  Repository,
  encodeVector,
  type DatabaseInstance,
} from '@ai-knowledge-inbox/db';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('AI Provider Adapter & Vector Index Integration Tests', () => {
  let fakeAI: FakeProviderServer;
  let dbFile: string;
  let db: DatabaseInstance;
  let repo: Repository;

  beforeEach(async () => {
    fakeAI = await startFakeAIServer();
    dbFile = join(tmpdir(), `test-ai-${Date.now()}-${Math.random().toString(36).substring(2)}.db`);
    db = createDatabase(dbFile);
    migrateDatabase(db, { embeddingModel: 'text-embedding-3-small', embeddingDimensions: 1536 });
    repo = new Repository(db);
  });

  afterEach(async () => {
    await fakeAI.close();
    db.$client.close();
    if (existsSync(dbFile)) unlinkSync(dbFile);
    if (existsSync(`${dbFile}-wal`)) unlinkSync(`${dbFile}-wal`);
    if (existsSync(`${dbFile}-shm`)) unlinkSync(`${dbFile}-shm`);
  });

  it('OpenAIClient generates embeddings from fake provider server', async () => {
    const client = new OpenAIClient({
      baseURL: fakeAI.baseUrl,
      apiKey: 'test-key',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      chatModel: 'gpt-4o-mini',
    });

    const embeddings = await client.generateEmbeddings(['Hello world', 'RAG retrieval']);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(1536);
  });

  it('VectorIndex reloads ready chunks and ranks search results', () => {
    const index = new VectorIndex({
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 4,
    });

    // Create item and publish chunk
    const dbSmall = createDatabase(':memory:');
    migrateDatabase(dbSmall, { embeddingModel: 'text-embedding-3-small', embeddingDimensions: 4 });
    const repoSmall = new Repository(dbSmall);

    const { item, jobId } = repoSmall.createItemWithJob({
      request: { type: 'text', content: 'Note content' },
      requestHash: 'hash1',
    });

    repoSmall.claimNextJob('w1');
    const vec1 = encodeVector([1.0, 0.0, 0.0, 0.0], 4);
    repoSmall.publishItemChunks({
      itemId: item.id,
      jobId,
      chunkData: [
        {
          ordinal: 0,
          text: 'Chunk 1 text',
          tokenCount: 3,
          embedding: vec1,
          embeddingModel: 'text-embedding-3-small',
          dimensions: 4,
          contentHash: 'chash1',
        },
      ],
    });

    const reloadResult = index.reload(repoSmall);
    expect(reloadResult.reloaded).toBe(true);
    expect(reloadResult.count).toBe(1);
    expect(index.isReady()).toBe(true);

    const searchResults = index.search([1.0, 0.0, 0.0, 0.0], 5, 0.1);
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.score).toBeCloseTo(1.0);
    expect(searchResults[0]?.text).toBe('Chunk 1 text');
  });

  it('VectorIndex detects model mismatch with database system_state', () => {
    const index = new VectorIndex({
      embeddingModel: 'different-model',
      embeddingDimensions: 1536,
    });

    expect(() => index.reload(repo)).toThrow(/INDEX_MODEL_MISMATCH/);
  });
});
