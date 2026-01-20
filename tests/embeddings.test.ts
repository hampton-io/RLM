/**
 * Tests for embeddings module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Similarity utilities
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  normalizeVector,
  averageVectors,
  MemoryVectorStore,
  createMemoryVectorStore,
  findSimilarChunks,
  rerankBySimilarity,
  // Chunking utilities
  splitIntoSentences,
  splitIntoParagraphs,
  estimateTokenCount,
  chunkFixed,
  chunkBySentences,
  chunkByParagraphs,
  // Factory functions
  detectEmbeddingProvider,
} from '../src/embeddings/index.js';
import type { TextChunk, EmbeddingClient } from '../src/embeddings/types.js';

// =============================================================================
// Vector Operations Tests
// =============================================================================

describe('Vector Operations', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should handle similar vectors', () => {
      const a = [1, 2, 3];
      const b = [1, 2, 4];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeGreaterThan(0.9);
      expect(similarity).toBeLessThan(1);
    });

    it('should throw for mismatched dimensions', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('dimensions must match');
    });

    it('should return 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    });
  });

  describe('euclideanDistance', () => {
    it('should return 0 for identical vectors', () => {
      const vec = [1, 2, 3];
      expect(euclideanDistance(vec, vec)).toBe(0);
    });

    it('should calculate correct distance', () => {
      const a = [0, 0];
      const b = [3, 4];
      expect(euclideanDistance(a, b)).toBe(5);
    });

    it('should throw for mismatched dimensions', () => {
      expect(() => euclideanDistance([1], [1, 2])).toThrow('dimensions must match');
    });
  });

  describe('dotProduct', () => {
    it('should calculate correct dot product', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      expect(dotProduct(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
    });

    it('should return 0 for orthogonal vectors', () => {
      expect(dotProduct([1, 0], [0, 1])).toBe(0);
    });

    it('should throw for mismatched dimensions', () => {
      expect(() => dotProduct([1], [1, 2])).toThrow('dimensions must match');
    });
  });

  describe('normalizeVector', () => {
    it('should normalize vector to unit length', () => {
      const vec = [3, 4];
      const normalized = normalizeVector(vec);
      const magnitude = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2);
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should handle zero vector', () => {
      const vec = [0, 0, 0];
      const normalized = normalizeVector(vec);
      expect(normalized).toEqual([0, 0, 0]);
    });

    it('should preserve direction', () => {
      const vec = [3, 4];
      const normalized = normalizeVector(vec);
      expect(normalized[0] / normalized[1]).toBeCloseTo(3 / 4, 5);
    });
  });

  describe('averageVectors', () => {
    it('should return empty array for empty input', () => {
      expect(averageVectors([])).toEqual([]);
    });

    it('should return the vector for single input', () => {
      expect(averageVectors([[1, 2, 3]])).toEqual([1, 2, 3]);
    });

    it('should calculate average correctly', () => {
      const vectors = [
        [1, 2, 3],
        [3, 4, 5],
      ];
      expect(averageVectors(vectors)).toEqual([2, 3, 4]);
    });
  });
});

// =============================================================================
// Memory Vector Store Tests
// =============================================================================

describe('MemoryVectorStore', () => {
  const createTestChunks = (): TextChunk[] => [
    { text: 'Hello world', index: 0, startOffset: 0, endOffset: 11, tokenCount: 2, embedding: [1, 0, 0] },
    { text: 'Goodbye world', index: 1, startOffset: 12, endOffset: 25, tokenCount: 2, embedding: [0, 1, 0] },
    { text: 'Hello there', index: 2, startOffset: 26, endOffset: 37, tokenCount: 2, embedding: [0.9, 0.1, 0] },
  ];

  describe('add', () => {
    it('should add chunks to the store', () => {
      const store = new MemoryVectorStore();
      const chunks = createTestChunks();
      store.add(chunks);
      expect(store.size()).toBe(3);
    });

    it('should throw for chunks without embeddings', () => {
      const store = new MemoryVectorStore();
      const chunk: TextChunk = { text: 'test', index: 0, startOffset: 0, endOffset: 4, tokenCount: 1 };
      expect(() => store.add([chunk])).toThrow('has no embedding');
    });

    it('should detect dimension mismatch', () => {
      const store = new MemoryVectorStore();
      store.add([createTestChunks()[0]]);
      const badChunk: TextChunk = {
        text: 'bad',
        index: 3,
        startOffset: 0,
        endOffset: 3,
        tokenCount: 1,
        embedding: [1, 2], // Wrong dimensions
      };
      expect(() => store.add([badChunk])).toThrow('dimensions mismatch');
    });
  });

  describe('search', () => {
    it('should find most similar chunks', () => {
      const store = new MemoryVectorStore();
      store.add(createTestChunks());

      const results = store.search([1, 0, 0], { topK: 2 });
      expect(results.length).toBe(2);
      expect(results[0].chunk.text).toBe('Hello world');
      expect(results[0].score).toBeCloseTo(1, 5);
      expect(results[0].rank).toBe(1);
    });

    it('should filter by minScore', () => {
      const store = new MemoryVectorStore();
      store.add(createTestChunks());

      const results = store.search([1, 0, 0], { minScore: 0.5 });
      expect(results.every((r) => r.score >= 0.5)).toBe(true);
    });

    it('should respect topK limit', () => {
      const store = new MemoryVectorStore();
      store.add(createTestChunks());

      const results = store.search([0.5, 0.5, 0], { topK: 1 });
      expect(results.length).toBe(1);
    });

    it('should exclude text when includeText is false', () => {
      const store = new MemoryVectorStore();
      store.add(createTestChunks());

      const results = store.search([1, 0, 0], { includeText: false, topK: 1 });
      expect(results[0].chunk.text).toBe('');
    });
  });

  describe('clear', () => {
    it('should remove all chunks', () => {
      const store = new MemoryVectorStore();
      store.add(createTestChunks());
      expect(store.size()).toBe(3);
      store.clear();
      expect(store.size()).toBe(0);
    });
  });

  describe('getChunks', () => {
    it('should return copy of chunks', () => {
      const store = new MemoryVectorStore();
      const chunks = createTestChunks();
      store.add(chunks);
      const retrieved = store.getChunks();
      expect(retrieved).toHaveLength(3);
      // Should be a copy
      retrieved.pop();
      expect(store.size()).toBe(3);
    });
  });
});

describe('createMemoryVectorStore', () => {
  it('should create a new store', () => {
    const store = createMemoryVectorStore();
    expect(store).toBeInstanceOf(MemoryVectorStore);
  });
});

// =============================================================================
// Similarity Search Utilities Tests
// =============================================================================

describe('findSimilarChunks', () => {
  it('should find similar chunks from array', () => {
    const chunks: TextChunk[] = [
      { text: 'test1', index: 0, startOffset: 0, endOffset: 5, tokenCount: 1, embedding: [1, 0] },
      { text: 'test2', index: 1, startOffset: 6, endOffset: 11, tokenCount: 1, embedding: [0, 1] },
    ];

    const results = findSimilarChunks([1, 0], chunks, { topK: 1 });
    expect(results.length).toBe(1);
    expect(results[0].chunk.text).toBe('test1');
  });

  it('should filter out chunks without embeddings', () => {
    const chunks: TextChunk[] = [
      { text: 'has embedding', index: 0, startOffset: 0, endOffset: 13, tokenCount: 2, embedding: [1, 0] },
      { text: 'no embedding', index: 1, startOffset: 14, endOffset: 26, tokenCount: 2 },
    ];

    const results = findSimilarChunks([1, 0], chunks);
    expect(results.length).toBe(1);
  });
});

describe('rerankBySimilarity', () => {
  it('should reorder chunks by similarity', () => {
    const chunks: TextChunk[] = [
      { text: 'far', index: 0, startOffset: 0, endOffset: 3, tokenCount: 1, embedding: [0, 1] },
      { text: 'close', index: 1, startOffset: 4, endOffset: 9, tokenCount: 1, embedding: [0.9, 0.1] },
    ];

    const reranked = rerankBySimilarity([1, 0], chunks);
    expect(reranked[0].text).toBe('close');
    expect(reranked[1].text).toBe('far');
  });
});

// =============================================================================
// Text Splitting Tests
// =============================================================================

describe('Text Splitting', () => {
  describe('splitIntoSentences', () => {
    it('should split on periods', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const sentences = splitIntoSentences(text);
      expect(sentences).toHaveLength(3);
    });

    it('should split on question marks', () => {
      const text = 'Is this a question? Yes it is.';
      const sentences = splitIntoSentences(text);
      expect(sentences).toHaveLength(2);
    });

    it('should split on exclamation marks', () => {
      const text = 'Wow! That is amazing!';
      const sentences = splitIntoSentences(text);
      expect(sentences).toHaveLength(2);
    });

    it('should handle empty text', () => {
      expect(splitIntoSentences('')).toHaveLength(0);
      expect(splitIntoSentences('   ')).toHaveLength(0);
    });
  });

  describe('splitIntoParagraphs', () => {
    it('should split on double newlines', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const paragraphs = splitIntoParagraphs(text);
      expect(paragraphs).toHaveLength(3);
    });

    it('should handle multiple newlines', () => {
      const text = 'Para 1.\n\n\n\nPara 2.';
      const paragraphs = splitIntoParagraphs(text);
      expect(paragraphs).toHaveLength(2);
    });

    it('should handle empty text', () => {
      expect(splitIntoParagraphs('')).toHaveLength(0);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate tokens based on character count', () => {
      // ~4 chars per token
      const text = 'This is a test sentence with some words.';
      const estimate = estimateTokenCount(text);
      expect(estimate).toBeGreaterThan(5);
      expect(estimate).toBeLessThan(20);
    });

    it('should return 0 for empty text', () => {
      expect(estimateTokenCount('')).toBe(0);
    });
  });
});

// =============================================================================
// Chunking Tests
// =============================================================================

describe('Chunking Functions', () => {
  const sampleText = `This is the first paragraph with some content. It has multiple sentences. This makes it longer.

This is the second paragraph. It also has content. More sentences here too.

And a third paragraph for good measure. Final sentence.`;

  describe('chunkFixed', () => {
    it('should create chunks with fixed size', () => {
      const chunks = chunkFixed(sampleText, { chunkSize: 50 });
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(chunk.index).toBeGreaterThanOrEqual(0);
      });
    });

    it('should respect maxChunkSize', () => {
      const chunks = chunkFixed(sampleText, { maxChunkSize: 100 });
      chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(100);
      });
    });

    it('should handle short text', () => {
      const chunks = chunkFixed('Short text.', { chunkSize: 100 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Short text.');
    });
  });

  describe('chunkBySentences', () => {
    it('should group sentences into chunks', () => {
      const chunks = chunkBySentences(sampleText, { maxChunkSize: 100 });
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(100);
      });
    });

    it('should preserve sentence boundaries', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const chunks = chunkBySentences(text, { maxChunkSize: 20 });
      // Each chunk should end with sentence-ending punctuation or be the last chunk
      chunks.forEach((chunk) => {
        const lastChar = chunk.text.trim().slice(-1);
        expect(['.', '!', '?'].includes(lastChar) || chunk.index === chunks.length - 1).toBe(true);
      });
    });
  });

  describe('chunkByParagraphs', () => {
    it('should group paragraphs into chunks', () => {
      const chunks = chunkByParagraphs(sampleText, { maxChunkSize: 200 });
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should split large paragraphs', () => {
      // Create a large paragraph with sentences that exceeds maxChunkSize
      const largeParagraph = 'This is a sentence. '.repeat(50);
      const chunks = chunkByParagraphs(largeParagraph, { maxChunkSize: 50 });
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('detectEmbeddingProvider', () => {
    it('should detect OpenAI models', () => {
      expect(detectEmbeddingProvider('text-embedding-3-small')).toBe('openai');
      expect(detectEmbeddingProvider('text-embedding-3-large')).toBe('openai');
      expect(detectEmbeddingProvider('text-embedding-ada-002')).toBe('openai');
    });

    it('should detect Google models', () => {
      expect(detectEmbeddingProvider('text-embedding-004')).toBe('google');
      expect(detectEmbeddingProvider('text-embedding-005')).toBe('google');
    });

    it('should throw for unknown models', () => {
      expect(() => detectEmbeddingProvider('unknown-model' as any)).toThrow('Unknown embedding model');
    });
  });
});

// =============================================================================
// Chunk Metadata Tests
// =============================================================================

describe('TextChunk Metadata', () => {
  it('should have correct offsets', () => {
    const text = 'First chunk. Second chunk.';
    const chunks = chunkBySentences(text, { maxChunkSize: 5 });

    expect(chunks[0].startOffset).toBe(0);
    // Each chunk should have valid offsets
    chunks.forEach((chunk) => {
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
    });
  });

  it('should calculate token count', () => {
    const text = 'This is a test sentence.';
    const chunks = chunkFixed(text, { chunkSize: 100 });

    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });
});
