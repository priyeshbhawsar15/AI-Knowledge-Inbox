import { createServer } from 'node:http';
import { startFakeAIServer, OpenAIClient } from '@ai-knowledge-inbox/ai';
import { createDatabase, migrateDatabase, Repository } from '@ai-knowledge-inbox/db';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { WorkerRunner } from '../../apps/worker/src/runner.js';

process.env.NODE_ENV = 'test';

async function main() {
  const logger = createLogger({ name: 'test-fixtures', level: 'info' });

  // 1. Start Fake AI Server on port 8080
  const fakeAiPort = 8080;
  const fakeAi = await startFakeAIServer(fakeAiPort);
  logger.info({ baseUrl: fakeAi.baseUrl }, 'Fake AI Server running');

  // 2. Start Fixture Web Server on port 8081
  const fixtureServer = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.includes('/fixture-article.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Fixture Web Article</title>
</head>
<body>
  <h1>Fixture Web Article Title</h1>
  <p>This is a fixture web page content about RAG system design, SQLite WAL mode, and vector similarity search in AI Knowledge Inbox.</p>
</body>
</html>`);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  fixtureServer.listen(8081, '0.0.0.0', () => {
    logger.info('Fixture Web Server running at http://127.0.0.1:8081');
  });

  // 3. Start E2E Worker Runner connected to test-e2e.db
  const dbPath = process.env.DATABASE_PATH || './test-e2e.db';
  const db = createDatabase(dbPath);
  migrateDatabase(db, { embeddingModel: 'text-embedding-3-small', embeddingDimensions: 1536 });
  const repo = new Repository(db);

  const aiClient = new OpenAIClient({
    baseURL: fakeAi.baseUrl,
    apiKey: 'test-fake-key',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    chatModel: 'gpt-4o-mini',
    logger,
  });

  const workerRunner = new WorkerRunner({
    workerId: 'wrk_e2e_fixture',
    repository: repo,
    embeddingProvider: aiClient,
    logger,
    allowLocalhostInTests: true,
  });

  workerRunner.start().catch((err) => {
    logger.error({ err }, 'E2E Worker runner error');
  });

  const cleanup = async () => {
    logger.info('Shutting down test fixture servers and worker...');
    workerRunner.stop();
    await fakeAi.close();
    fixtureServer.close();
    db.$client.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Failed to start test fixture services:', err);
  process.exit(1);
});
