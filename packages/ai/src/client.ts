import OpenAI from 'openai';
import type { Logger } from 'pino';

export interface OpenAIClientOptions {
  baseURL: string;
  apiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chatModel: string;
  logger?: Logger | undefined;
}

export class OpenAIClient {
  private client: OpenAI;
  private embeddingModel: string;
  private embeddingDimensions: number;
  private chatModel: string;

  constructor(options: OpenAIClientOptions) {
    this.client = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
    });
    this.embeddingModel = options.embeddingModel;
    this.embeddingDimensions = options.embeddingDimensions;
    this.chatModel = options.chatModel;
  }

  public getModelInfo(): { model: string; dimensions: number; chatModel: string } {
    return {
      model: this.embeddingModel,
      dimensions: this.embeddingDimensions,
      chatModel: this.chatModel,
    };
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const batchSize = 64;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: batch,
        dimensions: this.embeddingDimensions,
      });

      if (!response.data || response.data.length !== batch.length) {
        throw new Error('AI_INVALID_RESPONSE: Embedding count mismatch from provider');
      }

      for (let j = 0; j < response.data.length; j++) {
        const item = response.data[j];
        if (!item || !item.embedding) {
          throw new Error('AI_INVALID_RESPONSE: Missing embedding item in response');
        }
        const vec = item.embedding;
        // console.log('DEBUG vec info:', Array.isArray(vec), typeof vec, vec.length, vec);
        if (vec.length !== this.embeddingDimensions) {
          throw new Error(
            `INDEX_MODEL_MISMATCH: Embedding dimension mismatch (${vec.length} vs expected ${this.embeddingDimensions})`
          );
        }
        for (const val of vec) {
          if (!Number.isFinite(val)) {
            throw new Error('AI_INVALID_RESPONSE: Embedding vector contains non-finite values');
          }
        }
        results.push(vec);
      }
    }

    return results;
  }

  public async generateChatCompletion(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const choice = response.choices[0];
    if (!choice || !choice.message || !choice.message.content) {
      throw new Error('AI_INVALID_RESPONSE: Empty response content from chat completion');
    }

    return choice.message.content;
  }
}
