/**
 * Utilities for handling and chunking large contexts.
 */

/**
 * Chunk text into segments of approximately the specified size.
 * Attempts to break at sentence or paragraph boundaries when possible.
 */
export function chunkText(text: string, chunkSize: number, overlap: number = 0): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // If we're not at the end, try to find a good break point
    if (end < text.length) {
      // Look for paragraph break first
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + chunkSize / 2) {
        end = paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = findLastSentenceBreak(text, start, end);
        if (sentenceBreak > start + chunkSize / 2) {
          end = sentenceBreak;
        } else {
          // Look for word break
          const wordBreak = text.lastIndexOf(' ', end);
          if (wordBreak > start) {
            end = wordBreak + 1;
          }
        }
      }
    } else {
      end = text.length;
    }

    chunks.push(text.slice(start, end).trim());

    // Move start position, accounting for overlap
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Find the last sentence break (. ! ?) within a range.
 */
function findLastSentenceBreak(text: string, start: number, end: number): number {
  const segment = text.slice(start, end);
  const matches = [...segment.matchAll(/[.!?]\s+/g)];

  if (matches.length === 0) {
    return -1;
  }

  const lastMatch = matches[matches.length - 1];
  return start + (lastMatch.index ?? 0) + lastMatch[0].length;
}

/**
 * Chunk text by lines.
 */
export function chunkByLines(text: string, linesPerChunk: number): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i += linesPerChunk) {
    const chunk = lines.slice(i, i + linesPerChunk).join('\n');
    if (chunk.trim()) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

/**
 * Estimate token count for a string.
 * Uses a rough approximation of ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to approximately the specified token count.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {
    return text;
  }

  // Find a good break point
  let end = maxChars;
  const wordBreak = text.lastIndexOf(' ', end);
  if (wordBreak > maxChars / 2) {
    end = wordBreak;
  }

  return text.slice(0, end) + '...';
}

/**
 * Get summary statistics about a context string.
 */
export function getContextStats(text: string): {
  characters: number;
  estimatedTokens: number;
  lines: number;
  paragraphs: number;
} {
  return {
    characters: text.length,
    estimatedTokens: estimateTokens(text),
    lines: text.split('\n').length,
    paragraphs: text.split(/\n\n+/).filter((p) => p.trim()).length,
  };
}
