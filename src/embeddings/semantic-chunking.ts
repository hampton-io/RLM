/**
 * Semantic text chunking using embeddings.
 */

import type {
  TextChunk,
  SemanticChunkOptions,
  SemanticChunkResult,
  ChunkStrategy,
  EmbeddingClient,
} from './types.js';
import { cosineSimilarity } from './similarity.js';

// =============================================================================
// Constants
// =============================================================================

/** Default options for semantic chunking */
const DEFAULT_OPTIONS: Required<SemanticChunkOptions> = {
  chunkSize: 512,
  minChunkSize: 100,
  maxChunkSize: 1024,
  similarityThreshold: 0.5,
  overlap: 50,
  preserveParagraphs: true,
};

/** Approximate characters per token */
const CHARS_PER_TOKEN = 4;

// =============================================================================
// Basic Chunking Functions
// =============================================================================

/**
 * Split text into sentences.
 *
 * @param text - Text to split
 * @returns Array of sentences
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or newline
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => s.trim().length > 0);
}

/**
 * Split text into paragraphs.
 *
 * @param text - Text to split
 * @returns Array of paragraphs
 */
export function splitIntoParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.filter((p) => p.trim().length > 0);
}

/**
 * Estimate token count for text.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Create a TextChunk object.
 *
 * @param text - Chunk text
 * @param index - Chunk index
 * @param startOffset - Start position in original text
 * @param endOffset - End position in original text
 * @returns TextChunk object
 */
function createChunk(
  text: string,
  index: number,
  startOffset: number,
  endOffset: number
): TextChunk {
  return {
    text,
    index,
    startOffset,
    endOffset,
    tokenCount: estimateTokenCount(text),
  };
}

// =============================================================================
// Fixed-Size Chunking
// =============================================================================

/**
 * Chunk text using fixed-size windows.
 *
 * @param text - Text to chunk
 * @param options - Chunking options
 * @returns Array of chunks
 */
export function chunkFixed(text: string, options: SemanticChunkOptions = {}): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const targetChars = opts.chunkSize * CHARS_PER_TOKEN;
  const overlapChars = opts.overlap * CHARS_PER_TOKEN;
  const chunks: TextChunk[] = [];

  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + targetChars, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      const lastQuestion = text.lastIndexOf('? ', end);
      const lastExclaim = text.lastIndexOf('! ', end);
      const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);

      if (breakPoint > start + targetChars / 2) {
        end = breakPoint + 2;
      } else {
        // Fall back to word break
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace + 1;
        }
      }
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push(createChunk(chunkText, index++, start, end));
    }

    // Move forward with overlap
    start = end - overlapChars;
    if (start <= (chunks[chunks.length - 1]?.startOffset ?? -1)) {
      start = end; // Prevent infinite loop
    }
  }

  return chunks;
}

// =============================================================================
// Sentence-Based Chunking
// =============================================================================

/**
 * Chunk text by combining sentences up to target size.
 *
 * @param text - Text to chunk
 * @param options - Chunking options
 * @returns Array of chunks
 */
export function chunkBySentences(text: string, options: SemanticChunkOptions = {}): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sentences = splitIntoSentences(text);
  const chunks: TextChunk[] = [];

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let startOffset = 0;
  let index = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokenCount(sentence);

    if (currentTokens + sentenceTokens > opts.maxChunkSize && currentChunk.length > 0) {
      // Current chunk is full, save it
      const chunkText = currentChunk.join(' ');
      const endOffset = startOffset + chunkText.length;
      chunks.push(createChunk(chunkText, index++, startOffset, endOffset));

      // Start new chunk (with overlap if specified)
      if (opts.overlap > 0 && currentChunk.length > 1) {
        const overlapSentences = Math.ceil(currentChunk.length / 3);
        currentChunk = currentChunk.slice(-overlapSentences);
        currentTokens = estimateTokenCount(currentChunk.join(' '));
      } else {
        currentChunk = [];
        currentTokens = 0;
      }
      startOffset = endOffset;
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ');
    chunks.push(createChunk(chunkText, index, startOffset, startOffset + chunkText.length));
  }

  return chunks;
}

// =============================================================================
// Paragraph-Based Chunking
// =============================================================================

/**
 * Chunk text by combining paragraphs up to target size.
 *
 * @param text - Text to chunk
 * @param options - Chunking options
 * @returns Array of chunks
 */
export function chunkByParagraphs(text: string, options: SemanticChunkOptions = {}): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const paragraphs = splitIntoParagraphs(text);
  const chunks: TextChunk[] = [];

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let startOffset = 0;
  let index = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokenCount(paragraph);

    // If single paragraph exceeds max, use sentence chunking for it
    if (paragraphTokens > opts.maxChunkSize) {
      // Save current chunk first
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        chunks.push(createChunk(chunkText, index++, startOffset, startOffset + chunkText.length));
        startOffset += chunkText.length + 2;
        currentChunk = [];
        currentTokens = 0;
      }

      // Chunk the large paragraph by sentences
      const subChunks = chunkBySentences(paragraph, opts);
      for (const subChunk of subChunks) {
        chunks.push(createChunk(subChunk.text, index++, startOffset, startOffset + subChunk.text.length));
        startOffset += subChunk.text.length;
      }
      continue;
    }

    if (currentTokens + paragraphTokens > opts.maxChunkSize && currentChunk.length > 0) {
      // Current chunk is full, save it
      const chunkText = currentChunk.join('\n\n');
      chunks.push(createChunk(chunkText, index++, startOffset, startOffset + chunkText.length));
      startOffset += chunkText.length + 2;
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(paragraph);
    currentTokens += paragraphTokens;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join('\n\n');
    chunks.push(createChunk(chunkText, index, startOffset, startOffset + chunkText.length));
  }

  return chunks;
}

// =============================================================================
// Semantic Chunking with Embeddings
// =============================================================================

/**
 * Chunk text semantically using embeddings to find natural break points.
 *
 * This approach:
 * 1. Splits text into sentences
 * 2. Computes embeddings for each sentence
 * 3. Identifies semantic boundaries where adjacent sentences are dissimilar
 * 4. Groups sentences into coherent chunks
 *
 * @param text - Text to chunk
 * @param embeddingClient - Client for generating embeddings
 * @param options - Chunking options
 * @returns Array of chunks with embeddings
 */
export async function chunkSemantic(
  text: string,
  embeddingClient: EmbeddingClient,
  options: SemanticChunkOptions = {}
): Promise<TextChunk[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // First, use paragraph chunking to respect structure
  let segments: string[];
  if (opts.preserveParagraphs) {
    segments = splitIntoParagraphs(text);
    // Split large paragraphs into sentences
    segments = segments.flatMap((p) => {
      if (estimateTokenCount(p) > opts.maxChunkSize) {
        return splitIntoSentences(p);
      }
      return [p];
    });
  } else {
    segments = splitIntoSentences(text);
  }

  if (segments.length === 0) {
    return [];
  }

  // If only a few segments, just return them as chunks
  if (segments.length <= 3) {
    return segments.map((seg, i) => createChunk(seg, i, 0, seg.length));
  }

  // Get embeddings for all segments
  const embeddings = await embeddingClient.embedBatch(segments);

  // Find semantic boundaries using similarity between adjacent segments
  const boundaries: number[] = [0]; // Start boundary

  for (let i = 1; i < segments.length; i++) {
    const similarity = cosineSimilarity(
      embeddings.embeddings[i - 1],
      embeddings.embeddings[i]
    );

    // Low similarity indicates a semantic boundary
    if (similarity < opts.similarityThreshold) {
      boundaries.push(i);
    }
  }
  boundaries.push(segments.length); // End boundary

  // Group segments into chunks based on boundaries
  const chunks: TextChunk[] = [];
  let currentOffset = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const chunkSegments = segments.slice(start, end);

    // Check if chunk is too large, split if needed
    let currentGroup: string[] = [];
    let currentTokens = 0;

    for (const segment of chunkSegments) {
      const segmentTokens = estimateTokenCount(segment);

      if (currentTokens + segmentTokens > opts.maxChunkSize && currentGroup.length > 0) {
        // Save current group
        const chunkText = currentGroup.join(opts.preserveParagraphs ? '\n\n' : ' ');
        const chunkEmbeddings = embeddings.embeddings.slice(
          start + chunks.length,
          start + chunks.length + currentGroup.length
        );

        const chunk = createChunk(chunkText, chunks.length, currentOffset, currentOffset + chunkText.length);
        // Average the embeddings for this chunk
        if (chunkEmbeddings.length > 0) {
          chunk.embedding = averageEmbeddings(chunkEmbeddings);
        }
        chunks.push(chunk);
        currentOffset += chunkText.length + (opts.preserveParagraphs ? 2 : 1);

        currentGroup = [];
        currentTokens = 0;
      }

      currentGroup.push(segment);
      currentTokens += segmentTokens;
    }

    // Save remaining group
    if (currentGroup.length > 0) {
      const chunkText = currentGroup.join(opts.preserveParagraphs ? '\n\n' : ' ');
      const chunk = createChunk(chunkText, chunks.length, currentOffset, currentOffset + chunkText.length);

      // Get embedding for this chunk
      const chunkEmbedding = await embeddingClient.embed(chunkText);
      chunk.embedding = chunkEmbedding.embedding;
      chunks.push(chunk);
      currentOffset += chunkText.length + (opts.preserveParagraphs ? 2 : 1);
    }
  }

  return chunks;
}

/**
 * Average multiple embeddings into one.
 */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return embeddings[0];

  const dimensions = embeddings[0].length;
  const result = new Array(dimensions).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      result[i] += emb[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    result[i] /= embeddings.length;
  }

  return result;
}

// =============================================================================
// Main Chunking Function
// =============================================================================

/**
 * Chunk text using the specified strategy.
 *
 * @param text - Text to chunk
 * @param strategy - Chunking strategy
 * @param options - Chunking options
 * @param embeddingClient - Required for 'semantic' strategy
 * @returns Chunking result
 */
export async function chunkText(
  text: string,
  strategy: ChunkStrategy = 'fixed',
  options: SemanticChunkOptions = {},
  embeddingClient?: EmbeddingClient
): Promise<SemanticChunkResult> {
  let chunks: TextChunk[];

  switch (strategy) {
    case 'semantic':
      if (!embeddingClient) {
        throw new Error('Embedding client is required for semantic chunking');
      }
      chunks = await chunkSemantic(text, embeddingClient, options);
      break;

    case 'sentence':
      chunks = chunkBySentences(text, options);
      break;

    case 'paragraph':
      chunks = chunkByParagraphs(text, options);
      break;

    case 'fixed':
    default:
      chunks = chunkFixed(text, options);
      break;
  }

  return {
    chunks,
    totalChunks: chunks.length,
    strategy,
    originalLength: text.length,
    totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
  };
}

/**
 * Add embeddings to chunks.
 *
 * @param chunks - Chunks to embed
 * @param embeddingClient - Embedding client
 * @returns Chunks with embeddings added
 */
export async function embedChunks(
  chunks: TextChunk[],
  embeddingClient: EmbeddingClient
): Promise<TextChunk[]> {
  const texts = chunks.map((c) => c.text);
  const result = await embeddingClient.embedBatch(texts);

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: result.embeddings[i],
  }));
}
