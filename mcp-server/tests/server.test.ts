/**
 * MCP Server Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPServer, createMCPServer, MCPServerError } from '../src/server.js';
import { MCPRequest, MCPErrorCodes, RLMServerConfig, CodebaseIndex } from '../src/types.js';

describe('MCPServer', () => {
  let server: MCPServer;

  beforeEach(() => {
    server = createMCPServer();
  });

  describe('Server Creation', () => {
    it('should create server with default config', () => {
      const s = createMCPServer();
      expect(s).toBeInstanceOf(MCPServer);
    });

    it('should create server with custom config', () => {
      const config: Partial<RLMServerConfig> = {
        rootPath: '/custom/path',
        watchFiles: false,
      };
      const s = createMCPServer(config);
      expect(s).toBeInstanceOf(MCPServer);
    });
  });

  describe('Server Info', () => {
    it('should return server info', () => {
      const info = server.getServerInfo();
      expect(info.name).toBe('rlm-code-assistant');
      expect(info.version).toBe('1.0.0');
      expect(info.capabilities).toBeDefined();
    });

    it('should return capabilities', () => {
      const capabilities = server.getCapabilities();
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
    });
  });

  describe('Tool Registration', () => {
    it('should register a tool', () => {
      server.registerTool(
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        async () => ({ result: 'success' })
      );

      const definitions = server.getToolDefinitions();
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('test_tool');
    });

    it('should get all tool definitions', () => {
      server.registerTool(
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object', properties: {} },
        },
        async () => ({})
      );
      server.registerTool(
        {
          name: 'tool2',
          description: 'Tool 2',
          inputSchema: { type: 'object', properties: {} },
        },
        async () => ({})
      );

      const definitions = server.getToolDefinitions();
      expect(definitions).toHaveLength(2);
    });
  });

  describe('Request Handling', () => {
    describe('initialize', () => {
      it('should handle initialize request', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        };

        const response = await server.handleRequest(request);
        expect(response.result).toBeDefined();
        expect((response.result as any).serverInfo).toBeDefined();
        expect((response.result as any).capabilities).toBeDefined();
      });
    });

    describe('ping', () => {
      it('should handle ping request', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'ping',
        };

        const response = await server.handleRequest(request);
        expect(response.result).toEqual({ pong: true });
      });
    });

    describe('tools/list', () => {
      it('should return empty tool list', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        };

        const response = await server.handleRequest(request);
        expect(response.result).toEqual({ tools: [] });
      });

      it('should return registered tools', async () => {
        server.registerTool(
          {
            name: 'test_tool',
            description: 'Test',
            inputSchema: { type: 'object', properties: {} },
          },
          async () => ({})
        );

        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        };

        const response = await server.handleRequest(request);
        expect((response.result as any).tools).toHaveLength(1);
      });
    });

    describe('tools/call', () => {
      it('should call registered tool', async () => {
        server.registerTool(
          {
            name: 'echo',
            description: 'Echo tool',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string' },
              },
            },
          },
          async (args: any) => ({ echoed: args.message })
        );

        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'hello' },
          },
        };

        const response = await server.handleRequest(request);
        const result = response.result as any;
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe('text');
        expect(JSON.parse(result.content[0].text)).toEqual({ echoed: 'hello' });
      });

      it('should return error for unknown tool', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'unknown',
            arguments: {},
          },
        };

        const response = await server.handleRequest(request);
        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe(MCPErrorCodes.ToolNotFound);
      });

      it('should handle tool errors gracefully', async () => {
        server.registerTool(
          {
            name: 'failing',
            description: 'Failing tool',
            inputSchema: { type: 'object', properties: {} },
          },
          async () => {
            throw new Error('Test error');
          }
        );

        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'failing',
            arguments: {},
          },
        };

        const response = await server.handleRequest(request);
        const result = response.result as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Test error');
      });
    });

    describe('resources/list', () => {
      it('should return resources list', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/list',
        };

        const response = await server.handleRequest(request);
        expect((response.result as any).resources).toBeDefined();
      });
    });

    describe('unknown method', () => {
      it('should return method not found error', async () => {
        const request: MCPRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'unknown/method',
        };

        const response = await server.handleRequest(request);
        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe(MCPErrorCodes.MethodNotFound);
      });
    });
  });

  describe('Index Management', () => {
    it('should set and use index', async () => {
      const mockIndex: CodebaseIndex = {
        version: '1.0.0',
        rootPath: '/test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: new Map(),
        totalChunks: 0,
        totalSymbols: 0,
        languages: {} as any,
      };

      server.setIndex(mockIndex);

      const request: MCPRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'resources/read',
        params: { uri: 'rlm://index/stats' },
      };

      const response = await server.handleRequest(request);
      const result = response.result as any;
      expect(result.contents).toBeDefined();
      expect(result.contents[0].text).toContain('ready');
    });
  });
});

describe('MCPServerError', () => {
  it('should create error with code and message', () => {
    const error = new MCPServerError(MCPErrorCodes.ToolNotFound, 'Tool not found');
    expect(error.code).toBe(MCPErrorCodes.ToolNotFound);
    expect(error.message).toBe('Tool not found');
  });

  it('should convert to MCP error format', () => {
    const error = new MCPServerError(MCPErrorCodes.InternalError, 'Internal error', { extra: 'data' });
    const mcpError = error.toMCPError();
    expect(mcpError.code).toBe(MCPErrorCodes.InternalError);
    expect(mcpError.message).toBe('Internal error');
    expect(mcpError.data).toEqual({ extra: 'data' });
  });
});
