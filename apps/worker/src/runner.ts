import type { Repository } from '@ai-knowledge-inbox/db';
import type { Logger } from 'pino';
import { fetchPublicDocument, extractTextFromHtml, chunkText } from '@ai-knowledge-inbox/ingestion';
import { classifyError, calculateBackoffDelayMs, hashString } from '@ai-knowledge-inbox/domain';
import type { ErrorCode } from '@ai-knowledge-inbox/contracts';

export interface EmbeddingProvider {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getModelInfo(): { model: string; dimensions: number };
}

export interface WorkerRunnerOptions {
  workerId: string;
  repository: Repository;
  embeddingProvider: EmbeddingProvider;
  logger: Logger;
  pollIntervalMs?: number | undefined;
  allowLocalhostInTests?: boolean | undefined;
  allowlistedHosts?: string[] | undefined;
}

export class WorkerRunner {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastReclaimTime = 0;
  private lastWorkerHeartbeatTime = 0;

  constructor(private readonly options: WorkerRunnerOptions) {}

  public async start(): Promise<void> {
    const sysState = this.options.repository.getSystemState();
    if (!sysState) {
      throw new Error('Worker startup failed: Database system_state is uninitialized.');
    }

    const modelInfo = this.options.embeddingProvider.getModelInfo();
    if (
      sysState.embeddingModel !== modelInfo.model ||
      sysState.embeddingDimensions !== modelInfo.dimensions
    ) {
      throw new Error(
        `INDEX_MODEL_MISMATCH: Worker configured embedding model (${modelInfo.model}/${modelInfo.dimensions}) does not match DB system_state (${sysState.embeddingModel}/${sysState.embeddingDimensions})`
      );
    }

    this.isRunning = true;
    this.options.logger.info({ workerId: this.options.workerId }, 'Worker runner started');

    this.options.repository.upsertWorkerState(this.options.workerId, '1.0.0');
    this.lastWorkerHeartbeatTime = Date.now();

    await this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.options.logger.info({ workerId: this.options.workerId }, 'Worker runner stopped');
  }

  public async runOnce(): Promise<boolean> {
    const now = Date.now();

    // Worker heartbeat every 15s
    if (now - this.lastWorkerHeartbeatTime > 15000) {
      this.options.repository.upsertWorkerState(this.options.workerId, '1.0.0');
      this.lastWorkerHeartbeatTime = now;
    }

    // Reclaim expired leases every 30s
    if (now - this.lastReclaimTime > 30000) {
      const reclaimed = this.options.repository.reclaimExpiredLeases();
      if (reclaimed > 0) {
        this.options.logger.info({ reclaimedCount: reclaimed }, 'Reclaimed expired leases');
      }
      this.lastReclaimTime = now;
    }

    const claimed = this.options.repository.claimNextJob(this.options.workerId);
    if (!claimed) {
      return false;
    }

    const { job, item } = claimed;
    this.options.logger.info({ jobId: job.id, itemId: item.id, type: item.type }, 'Processing job');

    // Heartbeat job while processing
    const heartbeatInterval = setInterval(() => {
      this.options.repository.heartbeatJob(job.id, this.options.workerId);
    }, 15000);

    try {
      let rawContent = item.submittedText ?? '';
      let title = item.title ?? null;
      let canonicalUrl: string | null = null;

      if (item.type === 'url') {
        if (!item.sourceUrl) {
          throw new Error('VALIDATION_ERROR: URL item missing sourceUrl');
        }
        const doc = await fetchPublicDocument(item.sourceUrl, {
          allowLocalhostInTests: this.options.allowLocalhostInTests,
          allowlistedHosts: this.options.allowlistedHosts,
        });
        const extracted = extractTextFromHtml(doc.bodyText, doc.contentType, doc.finalUrl);
        rawContent = extracted.text;
        title = extracted.title ?? doc.finalUrl;
        canonicalUrl = extracted.canonicalUrl;
      } else if (item.type === 'text') {
        if (rawContent.trim().length < 1) {
          throw new Error('VALIDATION_ERROR: Note text is empty');
        }
        if (!title) {
          title = rawContent.slice(0, 40).trim() + (rawContent.length > 40 ? '...' : '');
        }
      }

      const textChunks = chunkText(rawContent);
      if (textChunks.length === 0) {
        throw new Error('CONTENT_NOT_EXTRACTABLE: Note or page produced zero chunks');
      }

      // Generate embeddings
      const chunkTexts = textChunks.map((c: { text: string }) => c.text);
      const vectors = await this.options.embeddingProvider.generateEmbeddings(chunkTexts);
      const modelInfo = this.options.embeddingProvider.getModelInfo();

      if (vectors.length !== textChunks.length) {
        throw new Error('AI_INVALID_RESPONSE: Vector count mismatch from embedding provider');
      }

      const chunkData = textChunks.map((c: { ordinal: number; text: string; tokenCount: number; contentHash: string }, i: number) => {
        const vec = vectors[i];
        if (!vec) throw new Error('AI_INVALID_RESPONSE: Missing vector element');

        const floatArray = new Float32Array(vec);
        const buffer = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);

        return {
          ordinal: c.ordinal,
          text: c.text,
          tokenCount: c.tokenCount,
          embedding: buffer,
          embeddingModel: modelInfo.model,
          dimensions: modelInfo.dimensions,
          contentHash: c.contentHash,
        };
      });

      const contentHash = hashString(rawContent);

      this.options.repository.publishItemChunks({
        itemId: item.id,
        jobId: job.id,
        rawContent,
        canonicalUrl: canonicalUrl ?? undefined,
        title: title ?? undefined,
        contentHash,
        chunkData,
      });

      this.options.logger.info({ jobId: job.id, itemId: item.id, chunkCount: chunkData.length }, 'Job succeeded');
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      let code = 'INTERNAL_ERROR';

      const match = errMsg.match(/^([A-Z_]+):/);
      if (match && match[1]) {
        code = match[1];
      }

      const classification = classifyError(code as ErrorCode);
      this.options.logger.warn(
        { jobId: job.id, itemId: item.id, code, classification, error: errMsg },
        'Job processing error'
      );

      if (classification === 'transient' && job.attempt < job.maxAttempts) {
        const delayMs = calculateBackoffDelayMs(job.attempt);
        const availableAt = new Date(Date.now() + delayMs).toISOString();
        this.options.repository.recordJobRetry(job.id, item.id, code, errMsg, availableAt);
      } else {
        this.options.repository.recordJobFailure(job.id, item.id, code, errMsg);
      }

      return true;
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  private async loop(): Promise<void> {
    const pollInterval = this.options.pollIntervalMs ?? 500;
    while (this.isRunning) {
      try {
        const processed = await this.runOnce();
        if (!processed) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      } catch (err: unknown) {
        this.options.logger.error({ err }, 'Unhandled error in worker loop');
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }
  }
}
