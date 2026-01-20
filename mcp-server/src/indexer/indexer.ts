/**
 * Codebase Indexer
 *
 * Indexes source code files, extracts symbols, and generates embeddings
 * for semantic search.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  CodebaseIndex,
  IndexedFile,
  IndexedChunk,
  CodeSymbol,
  ChunkType,
  RLMServerConfig,
  DEFAULT_CONFIG,
  IndexEvent,
  IndexEventHandler,
  SupportedLanguage,
} from '../types.js';
import {
  discoverFiles,
  computeFileHash,
  readFileContent,
  ensureDirectory,
  fileExists,
} from '../utils/files.js';
import { extractSymbols, detectLanguage } from '../utils/language.js';

/**
 * Index version for compatibility checking
 */
const INDEX_VERSION = '1.0.0';

/**
 * Codebase Indexer
 */
export class CodebaseIndexer {
  private config: RLMServerConfig;
  private index: CodebaseIndex | null = null;
  private eventHandlers: IndexEventHandler[] = [];
  private embeddingClient: EmbeddingClient | null = null;

  constructor(config: Partial<RLMServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set embedding client for semantic indexing
   */
  setEmbeddingClient(client: EmbeddingClient): void {
    this.embeddingClient = client;
  }

  /**
   * Subscribe to index events
   */
  onEvent(handler: IndexEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit an index event
   */
  private emit(event: IndexEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  /**
   * Get the current index
   */
  getIndex(): CodebaseIndex | null {
    return this.index;
  }

  /**
   * Index the codebase
   */
  async indexCodebase(rootPath?: string): Promise<CodebaseIndex> {
    const root = rootPath || this.config.rootPath;
    const absoluteRoot = path.resolve(root);

    this.emit({
      type: 'started',
      data: { totalFiles: 0 },
    });

    // Discover files
    const files = await discoverFiles(absoluteRoot, {
      ignorePatterns: this.config.ignorePatterns,
      includePatterns: this.config.includePatterns,
      languages: this.config.languages,
      maxFileSize: this.config.maxFileSize,
      respectGitignore: true,
    });

    this.emit({
      type: 'progress',
      data: {
        totalFiles: files.length,
        processedFiles: 0,
      },
    });

    // Create index
    const index: CodebaseIndex = {
      version: INDEX_VERSION,
      rootPath: absoluteRoot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: new Map(),
      totalChunks: 0,
      totalSymbols: 0,
      languages: {} as Record<SupportedLanguage, number>,
    };

    // Process files
    let processedFiles = 0;
    for (const file of files) {
      try {
        const indexedFile = await this.indexFile(file.path, file.relativePath, file.language);

        index.files.set(file.relativePath, indexedFile);
        index.totalChunks += indexedFile.chunks.length;
        index.totalSymbols += indexedFile.symbols.length;

        // Track language distribution
        index.languages[file.language] = (index.languages[file.language] || 0) + 1;

        this.emit({
          type: 'file_indexed',
          data: {
            currentFile: file.relativePath,
            processedFiles: ++processedFiles,
            totalFiles: files.length,
          },
        });
      } catch (error) {
        this.emit({
          type: 'error',
          data: {
            currentFile: file.relativePath,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }

      // Progress update every 10 files
      if (processedFiles % 10 === 0) {
        this.emit({
          type: 'progress',
          data: {
            processedFiles,
            totalFiles: files.length,
          },
        });
      }
    }

    // Generate embeddings if client is available
    if (this.embeddingClient) {
      await this.generateEmbeddings(index);
    }

    this.index = index;

    this.emit({
      type: 'completed',
      data: {
        stats: {
          totalFiles: index.files.size,
          totalChunks: index.totalChunks,
          totalSymbols: index.totalSymbols,
          languages: index.languages,
          lastUpdated: index.updatedAt,
          indexSize: this.estimateIndexSize(index),
        },
      },
    });

    return index;
  }

  /**
   * Index a single file
   */
  private async indexFile(
    filePath: string,
    relativePath: string,
    language: SupportedLanguage
  ): Promise<IndexedFile> {
    const content = await readFileContent(filePath);
    const hash = await computeFileHash(filePath);
    const stats = await fs.stat(filePath);

    // Extract symbols
    const symbols = extractSymbols(content, language);

    // Create chunks
    const chunks = this.createChunks(content, relativePath, symbols, language);

    return {
      path: filePath,
      relativePath,
      language,
      hash,
      lastModified: stats.mtimeMs,
      size: stats.size,
      symbols,
      chunks,
    };
  }

  /**
   * Create chunks from file content
   */
  private createChunks(
    content: string,
    filePath: string,
    symbols: CodeSymbol[],
    language: SupportedLanguage
  ): IndexedChunk[] {
    const chunks: IndexedChunk[] = [];
    const lines = content.split('\n');
    const chunkSize = this.config.chunkSize || 500;
    const chunkOverlap = this.config.chunkOverlap || 50;

    // First, create symbol-based chunks
    for (const symbol of symbols) {
      const startLine = symbol.startLine - 1;
      const endLine = Math.min(symbol.endLine, lines.length);
      const chunkContent = lines.slice(startLine, endLine).join('\n');

      // Skip very large symbols (will be chunked separately)
      if (chunkContent.length > chunkSize * 3) {
        continue;
      }

      chunks.push({
        id: `${filePath}:${symbol.name}:${startLine}`,
        filePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        content: chunkContent,
        symbols: [symbol.name],
        type: this.symbolKindToChunkType(symbol.kind),
      });
    }

    // Then, create overlapping window chunks for remaining content
    let lineIndex = 0;
    const linesPerChunk = Math.ceil(chunkSize / 50); // Assume ~50 chars per line

    while (lineIndex < lines.length) {
      const startLine = lineIndex;
      const endLine = Math.min(lineIndex + linesPerChunk, lines.length);
      const chunkContent = lines.slice(startLine, endLine).join('\n');

      // Skip empty chunks
      if (chunkContent.trim().length === 0) {
        lineIndex += linesPerChunk;
        continue;
      }

      // Check if this chunk overlaps significantly with a symbol chunk
      const overlapsSymbol = chunks.some((c) => {
        if (c.type === 'block' || c.type === 'other') return false;
        return (
          (startLine + 1 >= c.startLine && startLine + 1 <= c.endLine) ||
          (endLine >= c.startLine && endLine <= c.endLine)
        );
      });

      if (!overlapsSymbol) {
        // Find symbols in this chunk
        const chunkSymbols = symbols
          .filter((s) => s.startLine >= startLine + 1 && s.startLine <= endLine)
          .map((s) => s.name);

        chunks.push({
          id: `${filePath}:block:${startLine}`,
          filePath,
          startLine: startLine + 1,
          endLine,
          content: chunkContent,
          symbols: chunkSymbols,
          type: 'block',
        });
      }

      // Move forward with overlap
      lineIndex += linesPerChunk - Math.floor(chunkOverlap / 50);
    }

    return chunks;
  }

  /**
   * Convert symbol kind to chunk type
   */
  private symbolKindToChunkType(kind: string): ChunkType {
    const mapping: Record<string, ChunkType> = {
      function: 'function',
      class: 'class',
      method: 'method',
      interface: 'interface',
      type: 'type',
      import: 'import',
      export: 'export',
    };
    return mapping[kind] || 'other';
  }

  /**
   * Generate embeddings for all chunks
   */
  private async generateEmbeddings(index: CodebaseIndex): Promise<void> {
    if (!this.embeddingClient) return;

    const allChunks: IndexedChunk[] = [];
    for (const file of index.files.values()) {
      allChunks.push(...file.chunks);
    }

    // Batch embeddings
    const batchSize = 100;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);

      try {
        const embeddings = await this.embeddingClient.embed(texts);
        for (let j = 0; j < batch.length; j++) {
          batch[j].embedding = embeddings[j];
        }
      } catch (error) {
        console.error('Failed to generate embeddings for batch:', error);
      }

      this.emit({
        type: 'progress',
        data: {
          processedFiles: Math.min(i + batchSize, allChunks.length),
          totalFiles: allChunks.length,
        },
      });
    }
  }

  /**
   * Update index for changed files
   */
  async updateIndex(changedFiles: string[]): Promise<void> {
    if (!this.index) {
      throw new Error('No index to update. Run indexCodebase first.');
    }

    for (const filePath of changedFiles) {
      const relativePath = path.relative(this.index.rootPath, filePath);

      // Check if file still exists
      if (!(await fileExists(filePath))) {
        // File was deleted
        const file = this.index.files.get(relativePath);
        if (file) {
          this.index.totalChunks -= file.chunks.length;
          this.index.totalSymbols -= file.symbols.length;
          this.index.files.delete(relativePath);

          this.emit({
            type: 'file_removed',
            data: { currentFile: relativePath },
          });
        }
        continue;
      }

      // Check if file has changed
      const existingFile = this.index.files.get(relativePath);
      const newHash = await computeFileHash(filePath);

      if (existingFile && existingFile.hash === newHash) {
        continue; // No change
      }

      // Re-index the file
      const language = detectLanguage(filePath);
      const indexedFile = await this.indexFile(filePath, relativePath, language);

      // Update index
      if (existingFile) {
        this.index.totalChunks -= existingFile.chunks.length;
        this.index.totalSymbols -= existingFile.symbols.length;
      }

      this.index.files.set(relativePath, indexedFile);
      this.index.totalChunks += indexedFile.chunks.length;
      this.index.totalSymbols += indexedFile.symbols.length;

      // Generate embeddings for new chunks
      if (this.embeddingClient) {
        const texts = indexedFile.chunks.map((c) => c.content);
        try {
          const embeddings = await this.embeddingClient.embed(texts);
          for (let i = 0; i < indexedFile.chunks.length; i++) {
            indexedFile.chunks[i].embedding = embeddings[i];
          }
        } catch (error) {
          console.error('Failed to generate embeddings:', error);
        }
      }

      this.emit({
        type: 'file_indexed',
        data: { currentFile: relativePath },
      });
    }

    this.index.updatedAt = Date.now();
  }

  /**
   * Save index to disk
   */
  async saveIndex(indexPath?: string): Promise<void> {
    if (!this.index) {
      throw new Error('No index to save');
    }

    const savePath = indexPath || path.join(this.config.rootPath, this.config.indexPath || '.rlm-index');
    await ensureDirectory(savePath);

    // Convert Map to array for serialization
    const serializable = {
      ...this.index,
      files: Array.from(this.index.files.entries()),
    };

    // Save main index
    await fs.writeFile(
      path.join(savePath, 'index.json'),
      JSON.stringify(serializable, null, 2)
    );

    // Save embeddings separately (they can be large)
    const embeddings: Record<string, number[]> = {};
    for (const file of this.index.files.values()) {
      for (const chunk of file.chunks) {
        if (chunk.embedding) {
          embeddings[chunk.id] = chunk.embedding;
        }
      }
    }

    if (Object.keys(embeddings).length > 0) {
      await fs.writeFile(
        path.join(savePath, 'embeddings.json'),
        JSON.stringify(embeddings)
      );
    }
  }

  /**
   * Load index from disk
   */
  async loadIndex(indexPath?: string): Promise<CodebaseIndex | null> {
    const loadPath = indexPath || path.join(this.config.rootPath, this.config.indexPath || '.rlm-index');

    try {
      const indexFile = path.join(loadPath, 'index.json');
      if (!(await fileExists(indexFile))) {
        return null;
      }

      const content = await fs.readFile(indexFile, 'utf-8');
      const data = JSON.parse(content);

      // Reconstruct Map from array
      const index: CodebaseIndex = {
        ...data,
        files: new Map(data.files),
      };

      // Load embeddings
      const embeddingsFile = path.join(loadPath, 'embeddings.json');
      if (await fileExists(embeddingsFile)) {
        const embeddingsContent = await fs.readFile(embeddingsFile, 'utf-8');
        const embeddings = JSON.parse(embeddingsContent);

        // Restore embeddings to chunks
        for (const file of index.files.values()) {
          for (const chunk of file.chunks) {
            if (embeddings[chunk.id]) {
              chunk.embedding = embeddings[chunk.id];
            }
          }
        }
      }

      this.index = index;
      return index;
    } catch (error) {
      console.error('Failed to load index:', error);
      return null;
    }
  }

  /**
   * Estimate index size in bytes
   */
  private estimateIndexSize(index: CodebaseIndex): number {
    let size = 0;

    for (const file of index.files.values()) {
      // Estimate file metadata
      size += 200;

      // Estimate chunks
      for (const chunk of file.chunks) {
        size += chunk.content.length;
        if (chunk.embedding) {
          size += chunk.embedding.length * 4; // 4 bytes per float
        }
      }

      // Estimate symbols
      size += file.symbols.length * 100;
    }

    return size;
  }
}

/**
 * Embedding client interface
 */
export interface EmbeddingClient {
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Create indexer with default configuration
 */
export function createIndexer(config: Partial<RLMServerConfig> = {}): CodebaseIndexer {
  return new CodebaseIndexer(config);
}
