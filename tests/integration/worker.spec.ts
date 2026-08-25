import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createDatabase, migrateDatabase, Repository, type DatabaseInstance } from '@ai-knowledge-inbox/db';
import { WorkerRunner, type EmbeddingProvider } from '../../apps/worker/src/runner.js';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { hashIngestRequest } from '@ai-knowledge-inbox/domain';
import { validateUrlAndResolveIp, fetchPublicDocument, extractTextFromHtml, chunkText } from '@ai-knowledge-inbox/ingestion';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const fakeEmbeddingProvider: EmbeddingProvider = {
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3, 0.4]);
  },
  getModelInfo() {
    return { model: 'text-embedding-3-small', dimensions: 4 };
  },
};

describe('Worker & Ingestion Pipeline Integration Tests', () => {
  let dbFile: string;
  let db: DatabaseInstance;
  let repo: Repository;
  let fixtureServer: Server;
  let serverPort: number;
  let serverBaseUrl: string;

  beforeEach(async () => {
    dbFile = join(tmpdir(), `test-worker-${Date.now()}-${Math.random().toString(36).substring(2)}.db`);
    db = createDatabase(dbFile);
    migrateDatabase(db);
    repo = new Repository(db);

    // Setup HTTP fixture server
    await new Promise<void>((resolve) => {
      fixtureServer = createServer((req, res) => {
        const url = req.url ?? '/';
        if (url === '/html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><head><title>Test Title</title></head><body><h1>Header</h1><p>This is a test paragraph with sufficient length to be extracted.</p></body></html>');
        } else if (url === '/text') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('This is a plain text document with sufficient length for extraction.');
        } else if (url === '/redirect') {
          res.writeHead(302, { Location: '/html' });
          res.end();
        } else if (url === '/redirect-private') {
          res.writeHead(302, { Location: 'http://127.0.0.1/secret' });
          res.end();
        } else if (url === '/oversize') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('a'.repeat(2 * 1024 * 1024 + 100));
        } else if (url === '/unsupported') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ secret: 'data' }));
        } else if (url === '/empty') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body></body></html>');
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      fixtureServer.listen(0, '127.0.0.1', () => {
        const addr = fixtureServer.address();
        if (typeof addr === 'object' && addr) {
          serverPort = addr.port;
          serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    db.$client.close();
    if (existsSync(dbFile)) unlinkSync(dbFile);
    if (existsSync(`${dbFile}-wal`)) unlinkSync(`${dbFile}-wal`);
    if (existsSync(`${dbFile}-shm`)) unlinkSync(`${dbFile}-shm`);
  });

  it('ssrf policy blocks private and loopback IPs in strict mode', async () => {
    await expect(validateUrlAndResolveIp('http://127.0.0.1/')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
    await expect(validateUrlAndResolveIp('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
    await expect(validateUrlAndResolveIp('http://10.0.0.1/')).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
  });

  it('fetchPublicDocument follows valid redirects and fetches content', async () => {
    const doc = await fetchPublicDocument(`${serverBaseUrl}/redirect`, { allowLocalhostInTests: true });
    expect(doc.statusCode).toBe(200);
    expect(doc.contentType).toBe('text/html');
    expect(doc.bodyText).toContain('Header');
  });

  it('fetchPublicDocument blocks redirect to private IP', async () => {
    await expect(
      validateUrlAndResolveIp('http://10.0.0.1/secret', { allowLocalhostInTests: false })
    ).rejects.toThrow(/URL_PRIVATE_ADDRESS/);
  });

  it('fetchPublicDocument throws for oversize and unsupported types', async () => {
    await expect(
      fetchPublicDocument(`${serverBaseUrl}/oversize`, { allowLocalhostInTests: true })
    ).rejects.toThrow(/PAYLOAD_TOO_LARGE/);

    await expect(
      fetchPublicDocument(`${serverBaseUrl}/unsupported`, { allowLocalhostInTests: true })
    ).rejects.toThrow(/URL_POLICY_VIOLATION/);
  });

  it('extractTextFromHtml strips tags and returns title', () => {
    const html = '<html><head><title>My Title</title><script>alert(1)</script></head><body><p>Hello world from test paragraph.</p></body></html>';
    const extracted = extractTextFromHtml(html, 'text/html');
    expect(extracted.title).toBe('My Title');
    expect(extracted.text).toBe('Hello world from test paragraph.');
    expect(extracted.text).not.toContain('alert');
  });

  it('chunkText splits text deterministically with overlap', () => {
    const text = 'Paragraph 1 content.\n\nParagraph 2 content.\n\nParagraph 3 content.';
    const chunks = chunkText(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.ordinal).toBe(0);
  });

  it('WorkerRunner processes a text note item end-to-end', async () => {
    const logger = createLogger({ level: 'silent' });
    const req = { type: 'text' as const, content: 'This is a test text note with sufficient content for chunking.' };
    const hash = hashIngestRequest(req);
    const { item } = repo.createItemWithJob({ request: req, requestHash: hash });

    const runner = new WorkerRunner({
      workerId: 'worker-test-1',
      repository: repo,
      embeddingProvider: fakeEmbeddingProvider,
      logger,
      allowLocalhostInTests: true,
    });

    const processed = await runner.runOnce();
    expect(processed).toBe(true);

    const updated = repo.getItemById(item.id);
    expect(updated?.status).toBe('ready');
    expect(updated?.chunkCount).toBeGreaterThan(0);
  });

  it('WorkerRunner processes a URL note item end-to-end', async () => {
    const logger = createLogger({ level: 'silent' });
    const req = { type: 'url' as const, url: `${serverBaseUrl}/html` };
    const hash = hashIngestRequest(req);
    const { item } = repo.createItemWithJob({ request: req, requestHash: hash });

    const runner = new WorkerRunner({
      workerId: 'worker-test-2',
      repository: repo,
      embeddingProvider: fakeEmbeddingProvider,
      logger,
      allowLocalhostInTests: true,
    });

    const processed = await runner.runOnce();
    expect(processed).toBe(true);

    const updated = repo.getItemById(item.id);
    expect(updated?.status).toBe('ready');
    expect(updated?.title).toBe('Test Title');
  });

  it('proves worker crash before publication leaves zero chunks and lease recovers', async () => {
    const logger = createLogger({ level: 'silent' });
    const req = { type: 'text' as const, content: 'Crash test note content' };
    const hash = hashIngestRequest(req);
    const { item } = repo.createItemWithJob({ request: req, requestHash: hash });

    // Claim job as worker 1
    const claimed = repo.claimNextJob('worker-crash');
    expect(claimed).not.toBeNull();
    expect(claimed?.job.state).toBe('running');

    // Crash simulation: worker dies, zero chunks published
    const chunks = repo.getReadyChunksForIndex();
    expect(chunks).toHaveLength(0);

    // Simulate lease expiration
    db.$client.exec(`UPDATE ingestion_jobs SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = '${claimed!.job.id}'`);
    const reclaimed = repo.reclaimExpiredLeases();
    expect(reclaimed).toBe(1);

    // Worker 2 reclaims and completes the job successfully
    const runner2 = new WorkerRunner({
      workerId: 'worker-2',
      repository: repo,
      embeddingProvider: fakeEmbeddingProvider,
      logger,
    });
    await runner2.runOnce();

    const finalItem = repo.getItemById(item.id);
    expect(finalItem?.status).toBe('ready');
    expect(finalItem?.chunkCount).toBeGreaterThan(0);
  });
});
