/**
 * MCP Server Implementation for RLM Claude Code Plugin
 *
 * Implements the Model Context Protocol (MCP) for integration with Claude Code.
 */

import { createInterface } from 'readline';
import {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
  MCPErrorCodes,
  MCPToolDefinition,
  MCPToolCall,
  MCPToolResult,
  MCPServerInfo,
  MCPServerCapabilities,
  RLMServerConfig,
  DEFAULT_CONFIG,
  CodebaseIndex,
  ToolContext,
  ToolHandler,
} from './types.js';

/**
 * MCP Server for RLM
 *
 * Handles JSON-RPC communication over stdio with Claude Code.
 */
export class MCPServer {
  private config: RLMServerConfig;
  private index: CodebaseIndex | null = null;
  private tools: Map<string, { definition: MCPToolDefinition; handler: ToolHandler }> = new Map();
  private initialized = false;
  private running = false;

  constructor(config: Partial<RLMServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get server info for MCP initialize response
   */
  getServerInfo(): MCPServerInfo {
    return {
      name: 'rlm-code-assistant',
      version: '1.0.0',
      capabilities: this.getCapabilities(),
    };
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): MCPServerCapabilities {
    return {
      tools: {
        listChanged: true,
      },
      resources: {
        subscribe: true,
        listChanged: true,
      },
    };
  }

  /**
   * Register a tool with the server
   */
  registerTool(definition: MCPToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Get all registered tool definitions
   */
  getToolDefinitions(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Set the codebase index
   */
  setIndex(index: CodebaseIndex): void {
    this.index = index;
  }

  /**
   * Get tool context for handlers
   */
  private getToolContext(abortSignal?: AbortSignal): ToolContext {
    return {
      config: this.config,
      index: this.index,
      abortSignal,
    };
  }

  /**
   * Handle an incoming MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;

        case 'initialized':
          this.initialized = true;
          result = {};
          break;

        case 'tools/list':
          result = await this.handleToolsList();
          break;

        case 'tools/call':
          result = await this.handleToolCall(params as MCPToolCall);
          break;

        case 'resources/list':
          result = await this.handleResourcesList();
          break;

        case 'resources/read':
          result = await this.handleResourceRead(params as { uri: string });
          break;

        case 'ping':
          result = { pong: true };
          break;

        case 'shutdown':
          this.running = false;
          result = {};
          break;

        default:
          throw this.createError(MCPErrorCodes.MethodNotFound, `Method not found: ${method}`);
      }

      return this.createResponse(id, result);
    } catch (error) {
      if (error instanceof MCPServerError) {
        return this.createErrorResponse(id, error.toMCPError());
      }
      return this.createErrorResponse(id, {
        code: MCPErrorCodes.InternalError,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(
    _params?: Record<string, unknown>
  ): Promise<{ serverInfo: MCPServerInfo; capabilities: MCPServerCapabilities }> {
    return {
      serverInfo: this.getServerInfo(),
      capabilities: this.getCapabilities(),
    };
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(): Promise<{ tools: MCPToolDefinition[] }> {
    return {
      tools: this.getToolDefinitions(),
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolCall(call: MCPToolCall): Promise<MCPToolResult> {
    const { name, arguments: args } = call;

    const tool = this.tools.get(name);
    if (!tool) {
      throw this.createError(MCPErrorCodes.ToolNotFound, `Tool not found: ${name}`);
    }

    try {
      const context = this.getToolContext();
      const result = await tool.handler(args, context);

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle resources/list request
   */
  private async handleResourcesList(): Promise<{
    resources: Array<{ uri: string; name: string; mimeType?: string }>;
  }> {
    // Return available resources (indexed files, stats, etc.)
    const resources: Array<{ uri: string; name: string; mimeType?: string }> = [
      {
        uri: 'rlm://index/stats',
        name: 'Index Statistics',
        mimeType: 'application/json',
      },
    ];

    if (this.index) {
      // Add indexed files as resources
      for (const [path] of this.index.files) {
        resources.push({
          uri: `rlm://file/${encodeURIComponent(path)}`,
          name: path,
          mimeType: 'text/plain',
        });
      }
    }

    return { resources };
  }

  /**
   * Handle resources/read request
   */
  private async handleResourceRead(params: { uri: string }): Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }> {
    const { uri } = params;

    if (uri === 'rlm://index/stats') {
      const stats = this.getIndexStats();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    if (uri.startsWith('rlm://file/')) {
      const filePath = decodeURIComponent(uri.replace('rlm://file/', ''));
      const file = this.index?.files.get(filePath);

      if (!file) {
        throw this.createError(MCPErrorCodes.FileNotFound, `File not found in index: ${filePath}`);
      }

      // Read file content
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');

      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: content,
          },
        ],
      };
    }

    throw this.createError(MCPErrorCodes.FileNotFound, `Resource not found: ${uri}`);
  }

  /**
   * Get index statistics
   */
  private getIndexStats(): Record<string, unknown> {
    if (!this.index) {
      return {
        status: 'not_indexed',
        message: 'Codebase has not been indexed yet',
      };
    }

    return {
      status: 'ready',
      rootPath: this.index.rootPath,
      totalFiles: this.index.files.size,
      totalChunks: this.index.totalChunks,
      totalSymbols: this.index.totalSymbols,
      languages: this.index.languages,
      createdAt: new Date(this.index.createdAt).toISOString(),
      updatedAt: new Date(this.index.updatedAt).toISOString(),
    };
  }

  /**
   * Create MCP response
   */
  private createResponse(id: string | number, result: unknown): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  /**
   * Create MCP error response
   */
  private createErrorResponse(id: string | number, error: MCPError): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }

  /**
   * Create an error
   */
  private createError(code: number, message: string, data?: unknown): MCPServerError {
    return new MCPServerError(code, message, data);
  }

  /**
   * Send a notification (no response expected)
   */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    this.writeMessage(notification);
  }

  /**
   * Write a message to stdout
   */
  private writeMessage(message: MCPResponse | MCPNotification): void {
    const json = JSON.stringify(message);
    process.stdout.write(json + '\n');
  }

  /**
   * Start the server (stdio mode)
   */
  async start(): Promise<void> {
    this.running = true;

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Log to stderr so it doesn't interfere with MCP protocol
    console.error('RLM MCP Server starting...');

    rl.on('line', async (line) => {
      if (!line.trim()) return;

      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await this.handleRequest(request);

        // Only send response for requests (not notifications)
        if (request.id !== undefined) {
          this.writeMessage(response);
        }
      } catch (error) {
        // Parse error
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: null as unknown as string,
          error: {
            code: MCPErrorCodes.ParseError,
            message: 'Invalid JSON',
          },
        };
        this.writeMessage(errorResponse);
      }
    });

    rl.on('close', () => {
      this.running = false;
      console.error('RLM MCP Server shutting down...');
      process.exit(0);
    });

    // Keep process alive
    await new Promise<void>((resolve) => {
      const checkRunning = () => {
        if (!this.running) {
          resolve();
        } else {
          setTimeout(checkRunning, 100);
        }
      };
      checkRunning();
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.running = false;
  }
}

/**
 * Custom error class for MCP errors
 */
export class MCPServerError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MCPServerError';
  }

  toMCPError(): MCPError {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

/**
 * Create and configure an MCP server with all RLM tools
 */
export function createMCPServer(config: Partial<RLMServerConfig> = {}): MCPServer {
  const server = new MCPServer(config);

  // Tools will be registered by the tool modules
  return server;
}
