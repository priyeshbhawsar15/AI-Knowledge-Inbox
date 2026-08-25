import type { Repository } from '@ai-knowledge-inbox/db';
import { decodeVector, cosineSimilarity } from '@ai-knowledge-inbox/db';
import type { Logger } from 'pino';

export interface IndexedChunk {
  chunkId: string;
  itemId: string;
  ordinal: number;
  text: string;
  vector: Float32Array;
  embeddingModel: string;
  dimensions: number;
  title: string | null;
  sourceUrl: string | null;
  canonicalUrl: string | null;
}

export interface SearchResult {
  chunkId: string;
  itemId: string;
  ordinal: number;
  text: string;
  title: string | null;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  score: number;
}

export interface VectorIndexOptions {
  embeddingModel: string;
  embeddingDimensions: number;
  logger?: Logger | undefined;
}

export class VectorIndex {
  private chunksMap: Map<string, IndexedChunk> = new Map();
  private indexVersion = 0;
  private isLoaded = false;
  private embeddingModel: string;
  private embeddingDimensions: number;

  constructor(options: VectorIndexOptions) {
    this.embeddingModel = options.embeddingModel;
    this.embeddingDimensions = options.embeddingDimensions;
  }

  public getVersion(): number {
    return this.indexVersion;
  }

  public isReady(): boolean {
    return this.isLoaded;
  }

  public getCount(): number {
    return this.chunksMap.size;
  }

  public reload(repository: Repository): { reloaded: boolean; count: number; version: number } {
    const sysState = repository.getSystemState();
    if (!sysState) {
      this.isLoaded = false;
      return { reloaded: false, count: 0, version: 0 };
    }

    if (
      sysState.embeddingModel !== this.embeddingModel ||
      sysState.embeddingDimensions !== this.embeddingDimensions
    ) {
      this.isLoaded = false;
      throw new Error(
        `INDEX_MODEL_MISMATCH: Configured model/dimensions (${this.embeddingModel}/${this.embeddingDimensions}) differ from database system_state (${sysState.embeddingModel}/${sysState.embeddingDimensions})`
      );
    }

    // Read all ready chunks for this model
    const dbChunks = repository.getReadyChunksForIndex(this.embeddingModel, this.embeddingDimensions);

    // Build new map off to the side
    const newMap = new Map<string, IndexedChunk>();
    for (const row of dbChunks) {
      const vector = decodeVector(row.embedding, this.embeddingDimensions);
      newMap.set(row.id, {
        chunkId: row.id,
        itemId: row.itemId,
        ordinal: row.ordinal,
        text: row.text,
        vector,
        embeddingModel: row.embeddingModel,
        dimensions: row.dimensions,
        title: row.title,
        sourceUrl: row.sourceUrl,
        canonicalUrl: row.canonicalUrl,
      });
    }

    // Atomic swap
    this.chunksMap = newMap;
    this.indexVersion = sysState.indexVersion;
    this.isLoaded = true;

    return { reloaded: true, count: this.chunksMap.size, version: this.indexVersion };
  }

  public search(
    queryVector: number[] | Float32Array,
    topK = 5,
    minScore = 0.3
  ): SearchResult[] {
    if (!this.isLoaded) {
      throw new Error('INDEX_UNAVAILABLE: Vector index is not loaded');
    }

    const qVec = new Float32Array(queryVector);
    if (qVec.length !== this.embeddingDimensions) {
      throw new Error(
        `INDEX_MODEL_MISMATCH: Query vector dimension ${qVec.length} does not match index dimension ${this.embeddingDimensions}`
      );
    }

    const results: SearchResult[] = [];

    for (const chunk of this.chunksMap.values()) {
      const score = cosineSimilarity(qVec, chunk.vector);
      if (score >= minScore) {
        results.push({
          chunkId: chunk.chunkId,
          itemId: chunk.itemId,
          ordinal: chunk.ordinal,
          text: chunk.text,
          title: chunk.title,
          sourceUrl: chunk.sourceUrl,
          canonicalUrl: chunk.canonicalUrl,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}
