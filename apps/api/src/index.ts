import { loadConfig } from '@ai-knowledge-inbox/config';
import { createLogger } from '@ai-knowledge-inbox/observability';
import { createDatabase, migrateDatabase, Repository } from '@ai-knowledge-inbox/db';
import { OpenAIClient, VectorIndex } from '@ai-knowledge-inbox/ai';
import { QueryService } from './services/queryService.js';
import { createApp } from './app.js';

const config = loadConfig();
const logger = createLogger({ name: 'api', level: config.LOG_LEVEL });

logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Starting API server...');

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

const vectorIndex = new VectorIndex({
  embeddingModel: config.EMBEDDING_MODEL,
  embeddingDimensions: config.EMBEDDING_DIMENSIONS,
  logger,
});

// Load vector index at API startup (builds valid snapshot, including empty if 0 ready chunks)
try {
  vectorIndex.reload(repository);
  logger.info({ count: vectorIndex.getCount() }, 'Vector index loaded at API startup');
} catch (err: unknown) {
  logger.warn({ err }, 'Vector index startup reload warning (will retry on readiness/query)');
}

const queryService = new QueryService({
  config,
  logger,
  repository,
  aiClient,
  vectorIndex,
});

const app = createApp({ config, logger, repository, vectorIndex, queryService });

const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info({ port: config.PORT }, 'API server listening');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down server...');
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
});
