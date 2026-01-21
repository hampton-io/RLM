/**
 * RLM MCP Server for Claude Code Integration
 *
 * Provides semantic code search, analysis, and understanding tools
 * for Claude Code through the Model Context Protocol.
 */

import { MCPServer, createMCPServer } from './server.js';
import { CodebaseIndexer, createIndexer } from './indexer/index.js';
import { CodeSearchEngine, createSearchEngine } from './search/index.js';
import { FileWatcher, createFileWatcher } from './watcher/index.js';
import {
  searchCodeDefinition,
  createSearchCodeHandler,
  explainCodeDefinition,
  createExplainCodeHandler,
  findUsagesDefinition,
  createFindUsagesHandler,
  analyzeDependenciesDefinition,
  createAnalyzeDependenciesHandler,
  findSecurityIssuesDefinition,
  findSecurityIssuesHandler,
  indexCodebaseDefinition,
  getIndexStatusDefinition,
} from './tools/index.js';
import { RLMServerConfig, DEFAULT_CONFIG } from './types.js';

// Re-export types
export * from './types.js';
export { MCPServer, createMCPServer } from './server.js';
export { CodebaseIndexer, createIndexer } from './indexer/index.js';
export { CodeSearchEngine, createSearchEngine } from './search/index.js';
export { FileWatcher, createFileWatcher } from './watcher/index.js';
export * from './tools/index.js';
export * from './utils/index.js';

/**
 * RLM Code Assistant - Main Application Class
 *
 * Integrates all components for a complete code analysis solution.
 */
export class RLMCodeAssistant {
  private server: MCPServer;
  private indexer: CodebaseIndexer;
  private searchEngine: CodeSearchEngine;
  private watcher: FileWatcher | null = null;
  private config: RLMServerConfig;

  constructor(config: Partial<RLMServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.server = createMCPServer(this.config);
    this.indexer = createIndexer(this.config);
    this.searchEngine = createSearchEngine();

    // Register tools
    this.registerTools();
  }

  /**
   * Register all MCP tools with the server
   */
  private registerTools(): void {
    // Search tool
    this.server.registerTool(
      searchCodeDefinition,
      createSearchCodeHandler(this.searchEngine)
    );

    // Explain code tool
    this.server.registerTool(explainCodeDefinition, createExplainCodeHandler());

    // Find usages tool
    this.server.registerTool(findUsagesDefinition, createFindUsagesHandler());

    // Analyze dependencies tool
    this.server.registerTool(
      analyzeDependenciesDefinition,
      createAnalyzeDependenciesHandler()
    );

    // Find security issues tool
    this.server.registerTool(
      findSecurityIssuesDefinition,
      findSecurityIssuesHandler
    );

    // Index codebase tool
    this.server.registerTool(indexCodebaseDefinition, async (args, context) => {
      const { path: rootPath, forceReindex = false } = args as {
        path?: string;
        forceReindex?: boolean;
      };

      // Try to load existing index
      if (!forceReindex) {
        const existingIndex = await this.indexer.loadIndex();
        if (existingIndex) {
          this.server.setIndex(existingIndex);
          this.searchEngine.setIndex(existingIndex);
          return {
            status: 'loaded',
            message: 'Loaded existing index from disk',
            stats: {
              totalFiles: existingIndex.files.size,
              totalChunks: existingIndex.totalChunks,
              totalSymbols: existingIndex.totalSymbols,
              languages: existingIndex.languages,
            },
          };
        }
      }

      // Index the codebase
      const index = await this.indexer.indexCodebase(rootPath);
      this.server.setIndex(index);
      this.searchEngine.setIndex(index);

      // Save index
      await this.indexer.saveIndex();

      return {
        status: 'indexed',
        message: 'Successfully indexed codebase',
        stats: {
          totalFiles: index.files.size,
          totalChunks: index.totalChunks,
          totalSymbols: index.totalSymbols,
          languages: index.languages,
        },
      };
    });

    // Get index status tool
    this.server.registerTool(getIndexStatusDefinition, async (_args, context) => {
      const index = this.indexer.getIndex();
      if (!index) {
        return {
          status: 'not_indexed',
          message: 'Codebase has not been indexed yet',
          suggestion: 'Use the index_codebase tool to index the project',
        };
      }

      return {
        status: 'ready',
        rootPath: index.rootPath,
        stats: {
          totalFiles: index.files.size,
          totalChunks: index.totalChunks,
          totalSymbols: index.totalSymbols,
          languages: index.languages,
        },
        timestamps: {
          created: new Date(index.createdAt).toISOString(),
          updated: new Date(index.updatedAt).toISOString(),
        },
      };
    });
  }

  /**
   * Start the file watcher for real-time updates
   */
  async startWatcher(): Promise<void> {
    if (this.watcher) {
      throw new Error('Watcher is already running');
    }

    this.watcher = createFileWatcher(this.config);
    this.watcher.setIndexer(this.indexer);

    // Subscribe to file changes
    this.watcher.onChange((event) => {
      console.error(`File ${event.type}: ${event.relativePath}`);

      // Send notification to Claude Code
      this.server.sendNotification('rlm/fileChanged', {
        type: event.type,
        path: event.relativePath,
        timestamp: event.timestamp,
      });
    });

    await this.watcher.start(this.config.rootPath);
  }

  /**
   * Stop the file watcher
   */
  stopWatcher(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Try to load existing index on startup
    const existingIndex = await this.indexer.loadIndex();
    if (existingIndex) {
      this.server.setIndex(existingIndex);
      this.searchEngine.setIndex(existingIndex);
      console.error('Loaded existing index from disk');
    }

    // Start file watcher if configured
    if (this.config.watchFiles) {
      try {
        await this.startWatcher();
      } catch (error) {
        console.error('Failed to start file watcher:', error);
      }
    }

    // Start MCP server
    await this.server.start();
  }

  /**
   * Stop the application
   */
  stop(): void {
    this.stopWatcher();
    this.server.stop();
  }

  /**
   * Get the MCP server instance
   */
  getServer(): MCPServer {
    return this.server;
  }

  /**
   * Get the indexer instance
   */
  getIndexer(): CodebaseIndexer {
    return this.indexer;
  }

  /**
   * Get the search engine instance
   */
  getSearchEngine(): CodeSearchEngine {
    return this.searchEngine;
  }
}

/**
 * Create and start the RLM Code Assistant
 */
export function createRLMCodeAssistant(
  config: Partial<RLMServerConfig> = {}
): RLMCodeAssistant {
  return new RLMCodeAssistant(config);
}

/**
 * Main entry point for CLI
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<RLMServerConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--root':
      case '-r':
        config.rootPath = args[++i];
        break;
      case '--no-watch':
        config.watchFiles = false;
        break;
      case '--help':
      case '-h':
        console.log(`
RLM MCP Server - Code Analysis for Claude Code

Usage: rlm-mcp-server [options]

Options:
  -r, --root <path>    Root path of the codebase (default: current directory)
  --no-watch           Disable file watching
  -h, --help           Show this help message

The server communicates via stdin/stdout using the MCP protocol.
        `);
        process.exit(0);
    }
  }

  const assistant = createRLMCodeAssistant(config);

  // Handle shutdown
  process.on('SIGINT', () => {
    assistant.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    assistant.stop();
    process.exit(0);
  });

  await assistant.start();
}

// Run if called directly
if (process.argv[1]?.includes('mcp-server')) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
