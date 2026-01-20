/**
 * MCP Server Types for RLM Claude Code Plugin
 */

// MCP Protocol Types
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// MCP Standard Error Codes
export const MCPErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Custom codes
  ToolNotFound: -32000,
  IndexNotReady: -32001,
  FileNotFound: -32002,
  LanguageNotSupported: -32003,
} as const;

// Tool Definition Types
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

export interface MCPPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: MCPPropertySchema;
  default?: unknown;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

// Server Capabilities
export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities: MCPServerCapabilities;
}

// Indexer Types
export interface IndexedFile {
  path: string;
  relativePath: string;
  language: SupportedLanguage;
  hash: string;
  lastModified: number;
  size: number;
  symbols: CodeSymbol[];
  chunks: IndexedChunk[];
}

export interface IndexedChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  embedding?: number[];
  symbols: string[];
  type: ChunkType;
}

export type ChunkType =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'import'
  | 'export'
  | 'comment'
  | 'block'
  | 'other';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  signature?: string;
  documentation?: string;
  children?: CodeSymbol[];
}

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'property'
  | 'variable'
  | 'constant'
  | 'interface'
  | 'type'
  | 'enum'
  | 'module'
  | 'namespace'
  | 'import'
  | 'export';

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'unknown';

// Index Database Types
export interface CodebaseIndex {
  version: string;
  rootPath: string;
  createdAt: number;
  updatedAt: number;
  files: Map<string, IndexedFile>;
  totalChunks: number;
  totalSymbols: number;
  languages: Record<SupportedLanguage, number>;
}

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  totalSymbols: number;
  languages: Record<string, number>;
  lastUpdated: number;
  indexSize: number;
}

// Search Types
export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  includeContext?: boolean;
  contextLines?: number;
}

export interface SearchFilters {
  languages?: SupportedLanguage[];
  paths?: string[];
  excludePaths?: string[];
  symbolKinds?: SymbolKind[];
  chunkTypes?: ChunkType[];
  minScore?: number;
}

export interface SearchResult {
  chunk: IndexedChunk;
  file: IndexedFile;
  score: number;
  matchType: 'semantic' | 'keyword' | 'symbol';
  highlights?: TextHighlight[];
  context?: {
    before: string[];
    after: string[];
  };
}

export interface TextHighlight {
  startOffset: number;
  endOffset: number;
  text: string;
}

// Tool-specific Types
export interface ExplainCodeRequest {
  path: string;
  startLine?: number;
  endLine?: number;
  symbolName?: string;
  detail?: 'brief' | 'detailed' | 'comprehensive';
}

export interface ExplainCodeResult {
  explanation: string;
  symbol?: CodeSymbol;
  relatedSymbols?: CodeSymbol[];
  examples?: string[];
  documentation?: string;
}

export interface FindUsagesRequest {
  symbolName: string;
  path?: string;
  includeDefinition?: boolean;
  includeTests?: boolean;
}

export interface FindUsagesResult {
  symbol: string;
  definition?: {
    file: string;
    line: number;
    code: string;
  };
  usages: Array<{
    file: string;
    line: number;
    code: string;
    context: string;
  }>;
  totalCount: number;
}

export interface AnalyzeDependenciesRequest {
  path?: string;
  depth?: number;
  includeDevDeps?: boolean;
}

export interface AnalyzeDependenciesResult {
  dependencies: DependencyNode[];
  circularDeps?: string[][];
  unusedDeps?: string[];
  missingDeps?: string[];
}

export interface DependencyNode {
  name: string;
  path: string;
  type: 'internal' | 'external' | 'builtin';
  imports: string[];
  importedBy: string[];
  depth: number;
}

export interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line: number;
  code: string;
  description: string;
  recommendation: string;
}

export interface RefactoringSuggestion {
  type: string;
  priority: 'low' | 'medium' | 'high';
  file: string;
  startLine: number;
  endLine: number;
  description: string;
  currentCode: string;
  suggestedCode?: string;
  rationale: string;
}

// Configuration Types
export interface RLMServerConfig {
  rootPath: string;
  indexPath?: string;
  embeddingProvider?: 'openai' | 'google' | 'local';
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  ignorePatterns?: string[];
  includePatterns?: string[];
  languages?: SupportedLanguage[];
  maxFileSize?: number;
  watchFiles?: boolean;
  cacheResults?: boolean;
  cacheTTL?: number;
}

export const DEFAULT_CONFIG: RLMServerConfig = {
  rootPath: '.',
  indexPath: '.rlm-index',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  chunkSize: 500,
  chunkOverlap: 50,
  ignorePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '*.min.js',
    '*.bundle.js',
    'coverage/**',
    '.next/**',
    '__pycache__/**',
    '*.pyc',
    'target/**',
    'vendor/**',
  ],
  includePatterns: ['**/*'],
  languages: [
    'typescript',
    'javascript',
    'python',
    'go',
    'rust',
    'java',
    'kotlin',
    'c',
    'cpp',
  ],
  maxFileSize: 1024 * 1024, // 1MB
  watchFiles: true,
  cacheResults: true,
  cacheTTL: 300000, // 5 minutes
};

// Event Types
export interface IndexEvent {
  type: 'started' | 'progress' | 'completed' | 'error' | 'file_indexed' | 'file_removed';
  data: {
    totalFiles?: number;
    processedFiles?: number;
    currentFile?: string;
    error?: string;
    stats?: IndexStats;
  };
}

export type IndexEventHandler = (event: IndexEvent) => void;

// Tool Handler Type
export type ToolHandler<T = Record<string, unknown>, R = unknown> = (
  args: T,
  context: ToolContext
) => Promise<R>;

export interface ToolContext {
  config: RLMServerConfig;
  index: CodebaseIndex | null;
  abortSignal?: AbortSignal;
}
