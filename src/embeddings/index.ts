/**
 * Embeddings module - semantic chunking and similarity search.
 */

// Types
export type {
  // Embedding models
  OpenAIEmbeddingModel,
  GoogleEmbeddingModel,
  EmbeddingModel,
  EmbeddingProvider,

  // Client types
  EmbeddingClientConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingClient,

  // Chunking types
  ChunkStrategy,
  SemanticChunkOptions,
  TextChunk,
  SemanticChunkResult,

  // Similarity types
  SimilaritySearchOptions,
  SimilarityResult,
  SimilaritySearchResult,

  // Vector store types
  VectorStoreOptions,
  VectorStore,
} from './types.js';

// OpenAI embeddings
export {
  OpenAIEmbeddingClient,
  createOpenAIEmbeddingClient,
} from './openai-embeddings.js';

// Google embeddings
export {
  GoogleEmbeddingClient,
  createGoogleEmbeddingClient,
} from './google-embeddings.js';

// Similarity utilities
export {
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  normalizeVector,
  averageVectors,
  MemoryVectorStore,
  createMemoryVectorStore,
  findSimilarChunks,
  rerankBySimilarity,
} from './similarity.js';

// Semantic chunking
export {
  splitIntoSentences,
  splitIntoParagraphs,
  estimateTokenCount,
  chunkFixed,
  chunkBySentences,
  chunkByParagraphs,
  chunkSemantic,
  chunkText,
  embedChunks,
} from './semantic-chunking.js';

// =============================================================================
// Factory Functions
// =============================================================================

import type { EmbeddingClient, EmbeddingModel, EmbeddingClientConfig } from './types.js';
import { OpenAIEmbeddingClient } from './openai-embeddings.js';
import { GoogleEmbeddingClient } from './google-embeddings.js';

/**
 * Detect the provider for an embedding model.
 *
 * @param model - The embedding model
 * @returns The provider name
 */
export function detectEmbeddingProvider(model: EmbeddingModel): 'openai' | 'google' {
  if (model.startsWith('text-embedding-3') || model === 'text-embedding-ada-002') {
    return 'openai';
  }
  if (model.startsWith('text-embedding-00')) {
    return 'google';
  }
  throw new Error(`Unknown embedding model: ${model}`);
}

/**
 * Create an embedding client for the specified model.
 *
 * @param model - The embedding model to use
 * @param config - Client configuration
 * @returns Configured embedding client
 *
 * @example
 * ```ts
 * const client = createEmbeddingClient('text-embedding-3-small');
 * const result = await client.embed('Hello, world!');
 * ```
 */
export function createEmbeddingClient(
  model: EmbeddingModel,
  config: EmbeddingClientConfig = {}
): EmbeddingClient {
  const provider = detectEmbeddingProvider(model);

  switch (provider) {
    case 'openai':
      return new OpenAIEmbeddingClient(model as 'text-embedding-3-small', config);
    case 'google':
      return new GoogleEmbeddingClient(model as 'text-embedding-004', config);
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}
