// Main exports
export { RLM } from './rlm.js';
export { RLMExecutor } from './executor.js';
export { RLMStreamingExecutor } from './streaming-executor.js';

// Type exports
export type {
  // Core types
  RLMOptions,
  RLMCompletionOptions,
  RLMResult,
  DryRunResult,
  RLMError,
  RLMErrorCode,

  // Streaming types
  RLMStreamEvent,
  RLMStreamEventType,
  RLMStreamEventData,
  StartEventData,
  ThinkingEventData,
  CodeEventData,
  CodeOutputEventData,
  SubQueryEventData,
  SubResponseEventData,
  FinalEventData,
  ErrorEventData,
  DoneEventData,

  // Model types
  SupportedModel,
  OpenAIModel,
  AnthropicModel,
  GoogleModel,
  ModelProvider,

  // Message types
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  ImageMediaType,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  TokenUsage,

  // Sandbox types
  SandboxOptions,
  SandboxResult,
  SandboxEnvironment,

  // Trace types
  TraceEntry,
  TraceEntryType,
  TraceData,
  LLMCallTrace,
  CodeExecutionTrace,
  SubLLMCallTrace,
  FinalOutputTrace,
  ErrorTrace,

  // API types
  CompletionRequest,
  CompletionResponse,

  // Parser types
  ParsedLLMOutput,
} from './types.js';

// Client exports
export {
  createClient,
  OpenAIClient,
  AnthropicClient,
  calculateCost,
  detectProvider,
  ResilientClient,
  createResilientClient,
  withLLMRetry,
  // OpenAI Responses API
  OpenAIResponsesClient,
  createResponsesClient,
  supportsResponsesAPI,
  extractCitationUrls,
  extractCitationFileIds,
  formatCitationsAsFootnotes,
  webSearchTool,
  fileSearchTool,
} from './clients/index.js';
export type {
  LLMClient,
  LLMClientConfig,
  ResilientClientOptions,
  TokenCount,
  // Responses API types
  ResponsesModel,
  WebSearchTool,
  FileSearchTool,
  CodeInterpreterTool,
  FunctionTool,
  ResponsesTool,
  ResponsesInputMessage,
  UrlCitation,
  FileCitation,
  Citation,
  TextOutputContent,
  WebSearchCallOutput,
  FileSearchCallOutput,
  MessageOutput,
  OutputItem,
  ResponsesResult,
  ResponsesOptions,
  ResponsesStreamEvent,
} from './clients/index.js';

// Sandbox exports
export {
  createSandbox,
  VMSandbox,
  createVMSandbox,
  // Tools
  BUILTIN_TOOLS,
  createToolRegistry,
  defaultToolRegistry,
  getToolsHelp,
  validateTool,
  wrapToolFunction,
  parseJSONTool,
  parseCSVTool,
  formatTableTool,
  dedupeTool,
  sortTool,
  groupByTool,
  flattenTool,
  pickTool,
  omitTool,
  countByTool,
  summarizeTool,
  extractBetweenTool,
  truncateTool,
  textStatsTool,
} from './sandbox/index.js';
export type {
  SandboxConfig,
  LLMQueryCallback,
  LLMQueryParallelCallback,
  SandboxTool,
  ToolParameter,
  ToolCategory,
  ToolRegistry,
} from './sandbox/index.js';

// Utility exports
export {
  // Parser
  parseLLMOutput,
  hasFinalAnswer,
  extractFinalAnswer,
  extractCodeBlocks,
  hasCodeBlocks,
  // Context
  chunkText,
  chunkByLines,
  truncateToTokens,
  getContextStats,
  // Token estimation
  estimateTokens,
  estimateTokensForString,
  estimateTokensForMessages,
  estimateInputTokens,
  estimateOutputTokens,
  estimateCost,
  estimateTotalCost,
  formatCostEstimate,
  formatCostSummary,
  compareCosts,
  getCheapestModel,
  // Errors
  isRLMError,
  isRLMErrorCode,
  wrapError,
  formatError,
  formatErrorMessage,
  missingApiKeyError,
  unsupportedModelError,
  // Retry
  withRetry,
  withRetryResult,
  withRetryAfter,
  createRetryWrapper,
  llmRetry,
  isRetryableError,
  // Timeout
  withTimeout,
  withTimeoutResult,
  TimeoutError,
  ExecutionTimer,
  createDeadline,
  isDeadlinePassed,
  getRemainingTime,
  raceWithTimeout,
  // Image utilities
  detectMediaType,
  isSupportedMediaType,
  getExtensionForMediaType,
  loadImage,
  createImageContent,
  createImageContentFromUrl,
  createImageContentFromBase64,
  estimateImageTokens,
  validateImageContent,
  summarizeImageContent,
} from './utils/index.js';
export type {
  RetryOptions,
  RetryResult,
  TimeoutOptions,
  TimeoutResult,
  TokenEstimate,
  CostEstimate,
  EstimateOptions,
  ImageLoadOptions,
  ImageInfo,
} from './utils/index.js';

// Logger exports
export {
  RLMLogger,
  TraceReporter,
  createFileReporter,
  createConsoleReporter,
} from './logger/index.js';
export type { TraceReporterOptions, TraceSession } from './logger/index.js';

// Multimodal helpers
export {
  isMultimodalContent,
  isImageContent,
  isTextContent,
  getTextFromContent,
  getImagesFromContent,
} from './types.js';

// Prompt exports
export { getSystemPrompt, createUserPrompt } from './prompts/index.js';

// Template exports
export {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  summarizeTemplate,
  extractTemplate,
  analyzeTemplate,
  compareTemplate,
  searchTemplate,
  qaTemplate,
  codeReviewTemplate,
  renderTemplate,
  render,
  createTemplateRegistry,
  defaultRegistry,
  listTemplateIds,
  getTemplateHelp,
  parseTemplateVars,
  quickTemplate,
} from './templates/index.js';
export type {
  PromptTemplate,
  TemplateCategory,
  TemplateVariable,
  TemplateExample,
  RenderOptions,
  RenderResult,
  TemplateRegistry,
} from './templates/index.js';

// Configuration exports
export {
  resolveConfig,
  loadEnvConfig,
  getApiKey,
  hasValidCredentials,
  getConfigSummary,
  DEFAULT_CONFIG,
  ENV_VARS,
} from './config.js';
export type { RLMConfigOptions, ResolvedConfig } from './config.js';

// Cost tracking exports
export { CostTracker, BudgetExceededError, TokenLimitExceededError } from './cost-tracker.js';

// Rate limiting exports
export {
  RateLimiter,
  withRateLimit,
  createProviderRateLimiter,
  PROVIDER_RATE_LIMITS,
} from './rate-limiter.js';
export type { RateLimiterOptions } from './rate-limiter.js';

// Fallback chain exports
export {
  FallbackChainClient,
  createFallbackChain,
  createProviderFallbackChain,
  createCostOptimizedChain,
  createQualityOptimizedChain,
  withFallback,
  isRateLimitError,
  isTimeoutError,
  isServerError,
  DEFAULT_FALLBACK_CHAINS,
  COST_OPTIMIZED_CHAIN,
  QUALITY_OPTIMIZED_CHAIN,
} from './fallback.js';
export type { FallbackEvent, FallbackChainOptions, FallbackChainResult } from './fallback.js';

// Cache exports
export { RLMCache, MemoryCacheBackend, withCache, hashString } from './cache.js';
export type { CacheEntry, CacheStats, CacheOptions, CacheBackend } from './cache.js';

// Batch processing exports
export { BatchProcessor, createBatchItems, mapBatch } from './batch.js';
export type {
  BatchItem,
  BatchItemResult,
  BatchOptions,
  BatchProgress,
  BatchResult,
} from './batch.js';

// Progress tracking exports
export {
  ProgressTracker,
  WebhookSender,
  createProgressTracker,
  streamToProgress,
  createProgressBar,
} from './progress.js';
export type {
  ProgressEvent,
  ProgressEventType,
  ProgressEventData,
  ProgressCallback,
  WebhookConfig,
} from './progress.js';

// Embeddings exports
export {
  // Embedding clients
  OpenAIEmbeddingClient,
  createOpenAIEmbeddingClient,
  GoogleEmbeddingClient,
  createGoogleEmbeddingClient,
  createEmbeddingClient,
  detectEmbeddingProvider,
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
  // Semantic chunking
  splitIntoSentences,
  splitIntoParagraphs,
  estimateTokenCount,
  chunkFixed,
  chunkBySentences,
  chunkByParagraphs,
  chunkSemantic,
  chunkText as chunkTextSemantic,
  embedChunks,
} from './embeddings/index.js';
export type {
  // Embedding models
  OpenAIEmbeddingModel,
  GoogleEmbeddingModel,
  EmbeddingModel,
  EmbeddingProvider,
  // Client types
  EmbeddingClientConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  EmbeddingClient,
  // Chunking types
  ChunkStrategy,
  SemanticChunkOptions,
  TextChunk,
  SemanticChunkResult,
  // Similarity types
  SimilaritySearchOptions,
  SimilarityResult,
  SimilaritySearchResult,
  // Vector store types
  VectorStoreOptions,
  VectorStore,
} from './embeddings/index.js';

// Session persistence exports
export {
  // Factory and persistence
  createSession,
  saveSession,
  loadSession,
  validateSession,
  // Session updates
  updateSessionStatus,
  updateSessionCheckpoint,
  updateSessionSandbox,
  addSessionTrace,
  updateSessionCost,
  completeSession,
  failSession,
  // Session manager
  SessionManager,
  // Utilities
  canResumeSession,
  getSessionProgress,
  exportSession,
  importSession,
  createSessionId,
  // Constants
  SESSION_VERSION,
  DEFAULT_SESSION_DIR,
} from './session.js';
export type {
  SessionStatus,
  ExecutionCheckpoint,
  SandboxSnapshot,
  SessionCost,
  SessionMetadata,
  RLMSession,
  CreateSessionOptions,
  SaveSessionOptions,
  LoadSessionOptions,
  SessionListEntry,
} from './session.js';

// Metrics exports
export {
  metricsCollector,
  metricsRouter,
  InMemoryStore,
  JsonFileStore,
  createMetricsStore,
} from './metrics/index.js';
export type {
  QueryMetric,
  MetricsConfig,
  MetricsStore,
  MetricsFilter,
  RetentionPolicy,
  StoreHealthResult,
  MetricsStoreStats,
  MetricsStoreConfig,
} from './metrics/index.js';
