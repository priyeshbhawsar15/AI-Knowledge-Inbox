import { createServer } from 'node:http';
import { startFakeAIServer } from '@ai-knowledge-inbox/ai';
import { createLogger } from '@ai-knowledge-inbox/observability';

process.env.NODE_ENV = 'test';

async function main() {
  const logger = createLogger({ name: 'fake-services', level: 'info' });

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

  const cleanup = async () => {
    logger.info('Shutting down fake services...');
    await fakeAi.close();
    fixtureServer.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Failed to start fake services:', err);
  process.exit(1);
});
