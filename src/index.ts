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
} from './clients/index.js';
export type { LLMClient, LLMClientConfig, ResilientClientOptions } from './clients/index.js';

// Sandbox exports
export { createSandbox, VMSandbox, createVMSandbox } from './sandbox/index.js';
export type { SandboxConfig, LLMQueryCallback, LLMQueryParallelCallback } from './sandbox/index.js';

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
  estimateTokens,
  truncateToTokens,
  getContextStats,
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
} from './utils/index.js';
export type { RetryOptions, RetryResult, TimeoutOptions, TimeoutResult } from './utils/index.js';

// Logger exports
export {
  RLMLogger,
  TraceReporter,
  createFileReporter,
  createConsoleReporter,
} from './logger/index.js';
export type { TraceReporterOptions, TraceSession } from './logger/index.js';

// Prompt exports
export { getSystemPrompt, createUserPrompt } from './prompts/index.js';

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
export {
  CostTracker,
  BudgetExceededError,
  TokenLimitExceededError,
} from './cost-tracker.js';

// Rate limiting exports
export {
  RateLimiter,
  withRateLimit,
  createProviderRateLimiter,
  PROVIDER_RATE_LIMITS,
} from './rate-limiter.js';
export type { RateLimiterOptions } from './rate-limiter.js';

// Cache exports
export {
  RLMCache,
  MemoryCacheBackend,
  withCache,
  hashString,
} from './cache.js';
export type {
  CacheEntry,
  CacheStats,
  CacheOptions,
  CacheBackend,
} from './cache.js';

// Batch processing exports
export {
  BatchProcessor,
  createBatchItems,
  mapBatch,
} from './batch.js';
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
