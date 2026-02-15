/**
 * Similarity calculation and vector operations.
 */

import type {
  TextChunk,
  SimilarityResult,
  SimilaritySearchOptions,
  VectorStore,
  VectorStoreOptions,
} from './types.js';

// =============================================================================
// Vector Operations
// =============================================================================

/**
 * Calculate cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1 (1 = identical)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Calculate Euclidean distance between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Distance (0 = identical)
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate dot product of two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let product = 0;
  for (let i = 0; i < a.length; i++) {
    product += a[i] * b[i];
  }

  return product;
}

/**
 * Normalize a vector to unit length.
 *
 * @param vector - Vector to normalize
 * @returns Normalized vector
 */
export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (const val of vector) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) {
    return vector;
  }

  return vector.map((val) => val / norm);
}

/**
 * Calculate the average of multiple vectors.
 *
 * @param vectors - Array of vectors
 * @returns Average vector
 */
export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }

  const dimensions = vectors[0].length;
  const result = new Array(dimensions).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) {
      result[i] += vector[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= vectors.length;
  }

  return result;
}

// =============================================================================
// In-Memory Vector Store
// =============================================================================

/**
 * Simple in-memory vector store using brute-force search.
 *
 * Suitable for small to medium datasets (up to ~10,000 vectors).
 * For larger datasets, consider using a dedicated vector database.
 *
 * @example
 * ```ts
 * const store = new MemoryVectorStore();
 * store.add(chunks);
 * const results = store.search(queryEmbedding, { topK: 5 });
 * ```
 */
export class MemoryVectorStore implements VectorStore {
  private chunks: TextChunk[] = [];
  private dimensions: number;

  constructor(options: VectorStoreOptions = {}) {
    this.dimensions = options.dimensions ?? 0;
  }

  /**
   * Add chunks with their embeddings to the store.
   */
  add(chunks: TextChunk[]): void {
    for (const chunk of chunks) {
      if (!chunk.embedding) {
        throw new Error(`Chunk at index ${chunk.index} has no embedding`);
      }

      // Set dimensions from first embedding if not specified
      if (this.dimensions === 0) {
        this.dimensions = chunk.embedding.length;
      } else if (chunk.embedding.length !== this.dimensions) {
        throw new Error(
          `Embedding dimensions mismatch: expected ${this.dimensions}, got ${chunk.embedding.length}`
        );
      }

      this.chunks.push(chunk);
    }
  }

  /**
   * Search for similar chunks using cosine similarity.
   */
  search(embedding: number[], options: SimilaritySearchOptions = {}): SimilarityResult[] {
    const { topK = 5, minScore = 0, includeText = true } = options;

    if (embedding.length !== this.dimensions && this.dimensions > 0) {
      throw new Error(
        `Query embedding dimensions mismatch: expected ${this.dimensions}, got ${embedding.length}`
      );
    }

    // Calculate similarities for all chunks
    const scored = this.chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(embedding, chunk.embedding!),
    }));

    // Filter by minimum score and sort by similarity (descending)
    const filtered = scored
      .filter((item) => item.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Build results
    return filtered.map((item, index) => ({
      chunk: includeText ? item.chunk : { ...item.chunk, text: '' },
      score: item.score,
      rank: index + 1,
    }));
  }

  /**
   * Get the number of chunks in the store.
   */
  size(): number {
    return this.chunks.length;
  }

  /**
   * Clear all chunks from the store.
   */
  clear(): void {
    this.chunks = [];
  }

  /**
   * Get all chunks (for debugging/export).
   */
  getChunks(): TextChunk[] {
    return [...this.chunks];
  }
}

/**
 * Create a memory vector store.
 *
 * @param options - Store options
 * @returns New vector store instance
 */
export function createMemoryVectorStore(options: VectorStoreOptions = {}): MemoryVectorStore {
  return new MemoryVectorStore(options);
}

// =============================================================================
// Similarity Search Utilities
// =============================================================================

/**
 * Find the most similar chunks to a query embedding.
 *
 * @param queryEmbedding - The query embedding vector
 * @param chunks - Array of chunks with embeddings
 * @param options - Search options
 * @returns Array of similarity results
 */
export function findSimilarChunks(
  queryEmbedding: number[],
  chunks: TextChunk[],
  options: SimilaritySearchOptions = {}
): SimilarityResult[] {
  const store = new MemoryVectorStore();
  store.add(chunks.filter((c) => c.embedding));
  return store.search(queryEmbedding, options);
}

/**
 * Rerank chunks based on similarity to a query.
 *
 * @param queryEmbedding - The query embedding
 * @param chunks - Chunks to rerank (must have embeddings)
 * @returns Chunks sorted by similarity (most similar first)
 */
export function rerankBySimilarity(queryEmbedding: number[], chunks: TextChunk[]): TextChunk[] {
  const results = findSimilarChunks(queryEmbedding, chunks, {
    topK: chunks.length,
    minScore: -1, // Include all
  });

  return results.map((r) => r.chunk);
}
