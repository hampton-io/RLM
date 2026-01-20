/**
 * Semantic Code Search
 *
 * Provides semantic search over indexed codebase using embeddings
 * and keyword matching.
 */

import {
  CodebaseIndex,
  IndexedChunk,
  IndexedFile,
  SearchQuery,
  SearchResult,
  SearchFilters,
  TextHighlight,
} from '../types.js';
import { EmbeddingClient } from '../indexer/indexer.js';

/**
 * Code Search Engine
 */
export class CodeSearchEngine {
  private index: CodebaseIndex | null = null;
  private embeddingClient: EmbeddingClient | null = null;

  /**
   * Set the codebase index
   */
  setIndex(index: CodebaseIndex): void {
    this.index = index;
  }

  /**
   * Set embedding client for semantic search
   */
  setEmbeddingClient(client: EmbeddingClient): void {
    this.embeddingClient = client;
  }

  /**
   * Search the codebase
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!this.index) {
      throw new Error('No index loaded. Please index the codebase first.');
    }

    const {
      query: queryText,
      filters = {},
      limit = 20,
      offset = 0,
      includeContext = true,
      contextLines = 3,
    } = query;

    // Collect all chunks that match filters
    const candidateChunks = this.filterChunks(filters);

    // Score and rank chunks
    const scoredResults = await this.scoreChunks(candidateChunks, queryText);

    // Sort by score
    scoredResults.sort((a, b) => b.score - a.score);

    // Apply pagination
    const paginatedResults = scoredResults.slice(offset, offset + limit);

    // Add context if requested
    if (includeContext) {
      for (const result of paginatedResults) {
        result.context = this.getContext(result.chunk, contextLines);
      }
    }

    return paginatedResults;
  }

  /**
   * Filter chunks based on criteria
   */
  private filterChunks(filters: SearchFilters): Array<{ chunk: IndexedChunk; file: IndexedFile }> {
    if (!this.index) return [];

    const results: Array<{ chunk: IndexedChunk; file: IndexedFile }> = [];

    for (const file of this.index.files.values()) {
      // Apply file-level filters
      if (filters.languages && !filters.languages.includes(file.language)) {
        continue;
      }

      if (filters.paths) {
        const matchesPath = filters.paths.some(
          (p) => file.relativePath.startsWith(p) || file.relativePath.includes(p)
        );
        if (!matchesPath) continue;
      }

      if (filters.excludePaths) {
        const excludedPath = filters.excludePaths.some(
          (p) => file.relativePath.startsWith(p) || file.relativePath.includes(p)
        );
        if (excludedPath) continue;
      }

      // Add matching chunks
      for (const chunk of file.chunks) {
        // Apply chunk-level filters
        if (filters.chunkTypes && !filters.chunkTypes.includes(chunk.type)) {
          continue;
        }

        results.push({ chunk, file });
      }
    }

    return results;
  }

  /**
   * Score chunks against query
   */
  private async scoreChunks(
    chunks: Array<{ chunk: IndexedChunk; file: IndexedFile }>,
    queryText: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Get query embedding if available
    let queryEmbedding: number[] | null = null;
    if (this.embeddingClient) {
      try {
        const embeddings = await this.embeddingClient.embed([queryText]);
        queryEmbedding = embeddings[0];
      } catch (error) {
        console.error('Failed to get query embedding:', error);
      }
    }

    // Tokenize query for keyword matching
    const queryTokens = this.tokenize(queryText.toLowerCase());

    for (const { chunk, file } of chunks) {
      let score = 0;
      let matchType: SearchResult['matchType'] = 'keyword';
      const highlights: TextHighlight[] = [];

      // Semantic score (if embeddings available)
      if (queryEmbedding && chunk.embedding) {
        const semanticScore = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        if (semanticScore > 0.3) {
          score += semanticScore * 10; // Weight semantic matches heavily
          matchType = 'semantic';
        }
      }

      // Keyword score
      const contentLower = chunk.content.toLowerCase();
      const keywordScore = this.computeKeywordScore(queryTokens, contentLower, highlights, chunk.content);
      score += keywordScore;

      // Symbol name bonus
      const symbolScore = this.computeSymbolScore(queryTokens, chunk.symbols);
      if (symbolScore > 0) {
        score += symbolScore * 5;
        if (matchType !== 'semantic') {
          matchType = 'symbol';
        }
      }

      // File path relevance
      const pathScore = this.computePathScore(queryTokens, file.relativePath.toLowerCase());
      score += pathScore * 0.5;

      // Skip low-scoring results
      if (score < 0.1) continue;

      results.push({
        chunk,
        file,
        score,
        matchType,
        highlights: highlights.length > 0 ? highlights : undefined,
      });
    }

    return results;
  }

  /**
   * Compute keyword matching score
   */
  private computeKeywordScore(
    queryTokens: string[],
    contentLower: string,
    highlights: TextHighlight[],
    originalContent: string
  ): number {
    let score = 0;

    for (const token of queryTokens) {
      if (token.length < 2) continue;

      let searchPos = 0;
      let matchCount = 0;

      while (searchPos < contentLower.length) {
        const pos = contentLower.indexOf(token, searchPos);
        if (pos === -1) break;

        matchCount++;
        searchPos = pos + token.length;

        // Add highlight
        highlights.push({
          startOffset: pos,
          endOffset: pos + token.length,
          text: originalContent.slice(pos, pos + token.length),
        });
      }

      if (matchCount > 0) {
        // Exact match bonus
        const exactMatch = new RegExp(`\\b${this.escapeRegex(token)}\\b`, 'i').test(contentLower);
        score += exactMatch ? matchCount * 2 : matchCount;
      }
    }

    // Normalize by content length
    return score / Math.sqrt(contentLower.length / 100 + 1);
  }

  /**
   * Compute symbol matching score
   */
  private computeSymbolScore(queryTokens: string[], symbols: string[]): number {
    let score = 0;

    for (const symbol of symbols) {
      const symbolLower = symbol.toLowerCase();
      for (const token of queryTokens) {
        if (symbolLower === token) {
          score += 5; // Exact match
        } else if (symbolLower.includes(token)) {
          score += 2; // Partial match
        } else if (this.camelCaseMatch(token, symbol)) {
          score += 3; // CamelCase match
        }
      }
    }

    return score;
  }

  /**
   * Compute path relevance score
   */
  private computePathScore(queryTokens: string[], pathLower: string): number {
    let score = 0;

    for (const token of queryTokens) {
      if (pathLower.includes(token)) {
        score += 1;
      }
    }

    return score;
  }

  /**
   * Check for camelCase matching
   */
  private camelCaseMatch(query: string, symbol: string): boolean {
    // Extract capital letters from symbol
    const capitals = symbol.replace(/[a-z]/g, '').toLowerCase();
    const queryLower = query.toLowerCase();

    return capitals.includes(queryLower) || symbol.toLowerCase().startsWith(queryLower);
  }

  /**
   * Get context lines around a chunk
   */
  private getContext(
    chunk: IndexedChunk,
    contextLines: number
  ): { before: string[]; after: string[] } | undefined {
    if (!this.index) return undefined;

    const file = this.index.files.get(chunk.filePath);
    if (!file) return undefined;

    // Read file content
    const content = chunk.content;
    const lines = content.split('\n');

    // This is a simplified implementation - in production,
    // we'd read the actual file and get surrounding lines
    return {
      before: [],
      after: [],
    };
  }

  /**
   * Tokenize text into searchable tokens
   */
  private tokenize(text: string): string[] {
    // Split on word boundaries and common separators
    const tokens = text
      .split(/[\s\-_./\\()[\]{}:;,<>'"!@#$%^&*+=|`~]+/)
      .filter((t) => t.length >= 2)
      .map((t) => t.toLowerCase());

    // Also split camelCase
    const camelTokens: string[] = [];
    for (const token of tokens) {
      const parts = token.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' ');
      camelTokens.push(...parts);
    }

    return [...new Set([...tokens, ...camelTokens])];
  }

  /**
   * Compute cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Find similar code patterns
   */
  async findSimilar(
    code: string,
    options: { limit?: number; minScore?: number } = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, minScore = 0.5 } = options;

    if (!this.index || !this.embeddingClient) {
      throw new Error('Semantic search requires both an index and embedding client');
    }

    // Get embedding for the code
    const [codeEmbedding] = await this.embeddingClient.embed([code]);

    const results: SearchResult[] = [];

    for (const file of this.index.files.values()) {
      for (const chunk of file.chunks) {
        if (!chunk.embedding) continue;

        const score = this.cosineSimilarity(codeEmbedding, chunk.embedding);
        if (score >= minScore) {
          results.push({
            chunk,
            file,
            score,
            matchType: 'semantic',
          });
        }
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Search by symbol name
   */
  searchSymbol(symbolName: string, options: SearchFilters = {}): SearchResult[] {
    if (!this.index) {
      throw new Error('No index loaded');
    }

    const results: SearchResult[] = [];
    const symbolLower = symbolName.toLowerCase();

    for (const file of this.index.files.values()) {
      // Apply filters
      if (options.languages && !options.languages.includes(file.language)) {
        continue;
      }

      for (const symbol of file.symbols) {
        const nameMatch = symbol.name.toLowerCase() === symbolLower;
        const partialMatch = symbol.name.toLowerCase().includes(symbolLower);

        if (nameMatch || partialMatch) {
          // Find the chunk containing this symbol
          const chunk = file.chunks.find(
            (c) => c.startLine <= symbol.startLine && c.endLine >= symbol.endLine
          );

          if (chunk) {
            results.push({
              chunk,
              file,
              score: nameMatch ? 10 : 5,
              matchType: 'symbol',
            });
          }
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Get all symbols in the codebase
   */
  getAllSymbols(filters: SearchFilters = {}): Array<{
    symbol: { name: string; kind: string; file: string; line: number };
    file: IndexedFile;
  }> {
    if (!this.index) return [];

    const symbols: Array<{
      symbol: { name: string; kind: string; file: string; line: number };
      file: IndexedFile;
    }> = [];

    for (const file of this.index.files.values()) {
      if (filters.languages && !filters.languages.includes(file.language)) {
        continue;
      }

      if (filters.symbolKinds) {
        for (const symbol of file.symbols) {
          if (filters.symbolKinds.includes(symbol.kind)) {
            symbols.push({
              symbol: {
                name: symbol.name,
                kind: symbol.kind,
                file: file.relativePath,
                line: symbol.startLine,
              },
              file,
            });
          }
        }
      } else {
        for (const symbol of file.symbols) {
          symbols.push({
            symbol: {
              name: symbol.name,
              kind: symbol.kind,
              file: file.relativePath,
              line: symbol.startLine,
            },
            file,
          });
        }
      }
    }

    return symbols;
  }
}

/**
 * Create search engine instance
 */
export function createSearchEngine(): CodeSearchEngine {
  return new CodeSearchEngine();
}
