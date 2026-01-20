/**
 * Types for embedding support.
 */

// =============================================================================
// Embedding Model Types
// =============================================================================

/** OpenAI embedding models */
export type OpenAIEmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

/** Google embedding models */
export type GoogleEmbeddingModel =
  | 'text-embedding-004'
  | 'text-embedding-005';

/** All supported embedding models */
export type EmbeddingModel = OpenAIEmbeddingModel | GoogleEmbeddingModel;

/** Embedding provider */
export type EmbeddingProvider = 'openai' | 'google';

// =============================================================================
// Embedding Client Types
// =============================================================================

/** Configuration for embedding clients */
export interface EmbeddingClientConfig {
  /** API key (overrides environment variable) */
  apiKey?: string;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/** Result of an embedding request */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Number of dimensions in the embedding */
  dimensions: number;
  /** Token count for the input */
  tokenCount?: number;
}

/** Result of a batch embedding request */
export interface BatchEmbeddingResult {
  /** Array of embeddings (one per input) */
  embeddings: number[][];
  /** Number of dimensions in each embedding */
  dimensions: number;
  /** Total token count for all inputs */
  totalTokens?: number;
}

/** Interface for embedding clients */
export interface EmbeddingClient {
  /** The provider (openai, google) */
  readonly provider: EmbeddingProvider;
  /** The model being used */
  readonly model: EmbeddingModel;

  /**
   * Generate an embedding for a single text.
   *
   * @param text - The text to embed
   * @returns The embedding result
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts.
   *
   * @param texts - Array of texts to embed
   * @returns Batch embedding result
   */
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
}

// =============================================================================
// Semantic Chunking Types
// =============================================================================

/** Strategy for chunking text */
export type ChunkStrategy = 'fixed' | 'semantic' | 'sentence' | 'paragraph';

/** Options for semantic chunking */
export interface SemanticChunkOptions {
  /** Target chunk size in tokens (default: 512) */
  chunkSize?: number;
  /** Minimum chunk size in tokens (default: 100) */
  minChunkSize?: number;
  /** Maximum chunk size in tokens (default: 1024) */
  maxChunkSize?: number;
  /** Similarity threshold for merging (0-1, default: 0.5) */
  similarityThreshold?: number;
  /** Overlap between chunks in tokens (default: 50) */
  overlap?: number;
  /** Whether to preserve paragraph boundaries (default: true) */
  preserveParagraphs?: boolean;
}

/** A chunk of text with metadata */
export interface TextChunk {
  /** The chunk text */
  text: string;
  /** Chunk index in the original text */
  index: number;
  /** Start position in original text */
  startOffset: number;
  /** End position in original text */
  endOffset: number;
  /** Estimated token count */
  tokenCount: number;
  /** Embedding vector (if computed) */
  embedding?: number[];
}

/** Result of semantic chunking */
export interface SemanticChunkResult {
  /** Array of chunks */
  chunks: TextChunk[];
  /** Total number of chunks */
  totalChunks: number;
  /** Strategy used for chunking */
  strategy: ChunkStrategy;
  /** Original text length */
  originalLength: number;
  /** Total estimated tokens */
  totalTokens: number;
}

// =============================================================================
// Similarity Search Types
// =============================================================================

/** Options for similarity search */
export interface SimilaritySearchOptions {
  /** Maximum number of results to return (default: 5) */
  topK?: number;
  /** Minimum similarity score (0-1, default: 0.0) */
  minScore?: number;
  /** Whether to include the chunk text in results (default: true) */
  includeText?: boolean;
}

/** A search result with similarity score */
export interface SimilarityResult {
  /** The matching chunk */
  chunk: TextChunk;
  /** Similarity score (0-1) */
  score: number;
  /** Rank in results (1-based) */
  rank: number;
}

/** Result of a similarity search */
export interface SimilaritySearchResult {
  /** Array of matching chunks with scores */
  results: SimilarityResult[];
  /** The query that was searched for */
  query: string;
  /** Query embedding (if available) */
  queryEmbedding?: number[];
}

// =============================================================================
// Vector Store Types
// =============================================================================

/** Options for vector store */
export interface VectorStoreOptions {
  /** Number of dimensions for embeddings */
  dimensions?: number;
}

/** Interface for vector storage */
export interface VectorStore {
  /**
   * Add chunks with their embeddings to the store.
   *
   * @param chunks - Chunks to add (must have embeddings)
   */
  add(chunks: TextChunk[]): void;

  /**
   * Search for similar chunks.
   *
   * @param embedding - Query embedding vector
   * @param options - Search options
   * @returns Array of similar chunks with scores
   */
  search(embedding: number[], options?: SimilaritySearchOptions): SimilarityResult[];

  /**
   * Get the number of chunks in the store.
   */
  size(): number;

  /**
   * Clear all chunks from the store.
   */
  clear(): void;
}
