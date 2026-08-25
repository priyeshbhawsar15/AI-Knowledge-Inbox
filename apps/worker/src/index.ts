import { loadConfig } from '@ai-knowledge-inbox/config';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { createDatabase, migrateDatabase, Repository } from '@ai-knowledge-inbox/db';
import { OpenAIClient } from '@ai-knowledge-inbox/ai';
import { WorkerRunner } from './runner.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const config = loadConfig();
const logger = createLogger({ name: 'worker', level: config.LOG_LEVEL });
const workerId = `wrk_${randomUUID().replace(/-/g, '')}`;

logger.info({ workerId, env: config.NODE_ENV }, 'Starting Ingestion Worker...');

const db = createDatabase(config.DATABASE_PATH);
migrateDatabase(db, {
  embeddingModel: config.EMBEDDING_MODEL,
  embeddingDimensions: config.EMBEDDING_DIMENSIONS,
});

const repository = new Repository(db);
const aiClient = new OpenAIClient({
  baseURL: config.AI_BASE_URL,
  apiKey: config.AI_API_KEY,
  embeddingModel: config.EMBEDDING_MODEL,
  embeddingDimensions: config.EMBEDDING_DIMENSIONS,
  chatModel: config.CHAT_MODEL,
  logger,
});

const allowlistedHosts = process.env.TEST_ALLOWED_HOSTS
  ? process.env.TEST_ALLOWED_HOSTS.split(',').map((h) => h.trim())
  : ['fake-services', 'localhost', '127.0.0.1'];

const runner = new WorkerRunner({
  workerId,
  repository,
  embeddingProvider: aiClient,
  logger,
  allowLocalhostInTests: config.NODE_ENV === 'test',
  allowlistedHosts: config.NODE_ENV === 'test' ? allowlistedHosts : undefined,
});

if (process.env.WORKER_PORT) {
  const port = Number(process.env.WORKER_PORT);
  const healthServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', workerId }));
  });
  healthServer.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'Worker health server listening');
  });
  process.on('SIGTERM', () => healthServer.close());
}

runner.start().catch((err) => {
  logger.fatal({ err }, 'Worker process fatal error');
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, stopping worker runner...');
  runner.stop();
  db.$client.close();
  process.exit(0);
});
