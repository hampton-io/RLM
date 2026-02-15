/**
 * Google embedding client implementation.
 */

import { GoogleGenAI } from '@google/genai';
import type {
  EmbeddingClient,
  EmbeddingClientConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  GoogleEmbeddingModel,
} from './types.js';

/**
 * Google embedding client.
 *
 * Supports text-embedding-004 and text-embedding-005 models.
 *
 * @example
 * ```ts
 * const client = new GoogleEmbeddingClient('text-embedding-004');
 * const result = await client.embed('Hello, world!');
 * console.log(result.embedding.length); // 768
 * ```
 */
export class GoogleEmbeddingClient implements EmbeddingClient {
  readonly provider = 'google' as const;
  readonly model: GoogleEmbeddingModel;

  private client: GoogleGenAI;

  constructor(
    model: GoogleEmbeddingModel = 'text-embedding-004',
    config: EmbeddingClientConfig = {}
  ) {
    this.model = model;

    const apiKey = config.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Google API key is required. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate an embedding for a single text.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.client.models.embedContent({
      model: this.model,
      contents: text,
    });

    const embedding = response.embeddings?.[0]?.values ?? [];

    return {
      embedding,
      dimensions: embedding.length,
      // Google doesn't provide token count for embeddings
      tokenCount: undefined,
    };
  }

  /**
   * Generate embeddings for multiple texts.
   *
   * Google processes texts sequentially (no native batch API).
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        dimensions: this.getDimensions(),
        totalTokens: undefined,
      };
    }

    // Process in parallel with concurrency limit
    const CONCURRENCY = 5;
    const embeddings: number[][] = new Array(texts.length);

    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const batch = texts.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((text) => this.embed(text)));

      results.forEach((result, j) => {
        embeddings[i + j] = result.embedding;
      });
    }

    return {
      embeddings,
      dimensions: embeddings[0]?.length ?? this.getDimensions(),
      totalTokens: undefined,
    };
  }

  /**
   * Get the embedding dimensions for the current model.
   */
  private getDimensions(): number {
    switch (this.model) {
      case 'text-embedding-004':
        return 768;
      case 'text-embedding-005':
        return 768;
      default:
        return 768;
    }
  }
}

/**
 * Create a Google embedding client.
 *
 * @param model - The embedding model to use
 * @param config - Client configuration
 * @returns Configured embedding client
 */
export function createGoogleEmbeddingClient(
  model: GoogleEmbeddingModel = 'text-embedding-004',
  config: EmbeddingClientConfig = {}
): GoogleEmbeddingClient {
  return new GoogleEmbeddingClient(model, config);
}
