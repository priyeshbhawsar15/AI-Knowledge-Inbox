import { loadConfig } from '@ai-knowledge-inbox/config';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { createDatabase, migrateDatabase, Repository } from '@ai-knowledge-inbox/db';
import { OpenAIClient } from '@ai-knowledge-inbox/ai';
import { WorkerRunner } from './runner.js';
import { randomUUID } from 'node:crypto';

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

const runner = new WorkerRunner({
  workerId,
  repository,
  embeddingProvider: aiClient,
  logger,
});

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
