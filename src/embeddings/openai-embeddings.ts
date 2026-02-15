/**
 * OpenAI embedding client implementation.
 */

import OpenAI from 'openai';
import type {
  EmbeddingClient,
  EmbeddingClientConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  OpenAIEmbeddingModel,
} from './types.js';

/** Default configuration */
const DEFAULT_CONFIG: Required<Omit<EmbeddingClientConfig, 'apiKey' | 'baseUrl'>> = {
  timeout: 60000,
};

/**
 * OpenAI embedding client.
 *
 * Supports text-embedding-3-small, text-embedding-3-large, and text-embedding-ada-002 models.
 *
 * @example
 * ```ts
 * const client = new OpenAIEmbeddingClient('text-embedding-3-small');
 * const result = await client.embed('Hello, world!');
 * console.log(result.embedding.length); // 1536
 * ```
 */
export class OpenAIEmbeddingClient implements EmbeddingClient {
  readonly provider = 'openai' as const;
  readonly model: OpenAIEmbeddingModel;

  private client: OpenAI;
  private config: Required<Omit<EmbeddingClientConfig, 'apiKey' | 'baseUrl'>> &
    Pick<EmbeddingClientConfig, 'apiKey' | 'baseUrl'>;

  constructor(
    model: OpenAIEmbeddingModel = 'text-embedding-3-small',
    config: EmbeddingClientConfig = {}
  ) {
    this.model = model;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: this.config.timeout,
    });
  }

  /**
   * Generate an embedding for a single text.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });

    const embedding = response.data[0].embedding;

    return {
      embedding,
      dimensions: embedding.length,
      tokenCount: response.usage?.total_tokens,
    };
  }

  /**
   * Generate embeddings for multiple texts.
   *
   * OpenAI supports batch embedding in a single request (up to 2048 inputs).
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        dimensions: this.getDimensions(),
        totalTokens: 0,
      };
    }

    // OpenAI has a limit of 2048 inputs per request
    const BATCH_LIMIT = 2048;

    if (texts.length <= BATCH_LIMIT) {
      return this.embedBatchDirect(texts);
    }

    // Process in batches
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;
    let dimensions = 0;

    for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
      const batch = texts.slice(i, i + BATCH_LIMIT);
      const result = await this.embedBatchDirect(batch);
      allEmbeddings.push(...result.embeddings);
      totalTokens += result.totalTokens ?? 0;
      dimensions = result.dimensions;
    }

    return {
      embeddings: allEmbeddings,
      dimensions,
      totalTokens,
    };
  }

  /**
   * Direct batch embedding (no batching logic).
   */
  private async embedBatchDirect(texts: string[]): Promise<BatchEmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    // Sort by index to ensure correct order
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    const embeddings = sorted.map((d) => d.embedding);

    return {
      embeddings,
      dimensions: embeddings[0]?.length ?? this.getDimensions(),
      totalTokens: response.usage?.total_tokens,
    };
  }

  /**
   * Get the embedding dimensions for the current model.
   */
  private getDimensions(): number {
    switch (this.model) {
      case 'text-embedding-3-small':
        return 1536;
      case 'text-embedding-3-large':
        return 3072;
      case 'text-embedding-ada-002':
        return 1536;
      default:
        return 1536;
    }
  }
}

/**
 * Create an OpenAI embedding client.
 *
 * @param model - The embedding model to use
 * @param config - Client configuration
 * @returns Configured embedding client
 */
export function createOpenAIEmbeddingClient(
  model: OpenAIEmbeddingModel = 'text-embedding-3-small',
  config: EmbeddingClientConfig = {}
): OpenAIEmbeddingClient {
  return new OpenAIEmbeddingClient(model, config);
}
