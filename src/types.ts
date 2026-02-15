import { z } from 'zod';

// =============================================================================
// LLM Client Types
// =============================================================================

export type ModelProvider = 'openai' | 'anthropic' | 'google';

// OpenAI Models (February 2026)
export type OpenAIModel =
  // GPT-5.2 Series (latest flagship)
  | 'gpt-5.2'
  | 'gpt-5.2-codex'
  // GPT-5.1 Series
  | 'gpt-5.1'
  | 'gpt-5.1-codex'
  | 'gpt-5.1-codex-max'
  | 'gpt-5.1-codex-mini'
  // GPT-5 Series
  | 'gpt-5'
  | 'gpt-5-mini'
  | 'gpt-5-nano'
  | 'gpt-5-pro'
  | 'gpt-5-codex'
  // GPT-4.1 Series
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-nano'
  // GPT-4o Series
  | 'gpt-4o'
  | 'gpt-4o-mini'
  // o4 Reasoning Models (latest)
  | 'o4-mini'
  | 'o4-mini-deep-research'
  // o3 Reasoning Models
  | 'o3'
  | 'o3-mini'
  | 'o3-pro'
  | 'o3-deep-research'
  // o1 Reasoning Models (deprecated)
  | 'o1'
  | 'o1-mini'
  | 'o1-pro'
  // Legacy models
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo';

// Anthropic Models (February 2026)
export type AnthropicModel =
  // Claude 4.6 Series (latest)
  | 'claude-opus-4-6'
  // Claude 4.5 Series (current flagship)
  | 'claude-sonnet-4-5'
  | 'claude-haiku-4-5'
  | 'claude-opus-4-5'
  // Versioned aliases
  | 'claude-sonnet-4-5-20250929'
  | 'claude-haiku-4-5-20251001'
  | 'claude-opus-4-5-20251101'
  // Claude 4 Legacy
  | 'claude-opus-4-1'
  // Legacy 3.x (deprecated but still available)
  | 'claude-3-5-sonnet-latest'
  | 'claude-3-5-haiku-latest'
  | 'claude-3-opus-latest'
  | 'claude-3-haiku-20240307';

// Google Gemini Models (February 2026)
export type GoogleModel =
  // Gemini 3 Series (latest)
  | 'gemini-3-pro-preview'
  | 'gemini-3-flash-preview'
  // Gemini 2.5 Series (production)
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  // Gemini 2.0 Series
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite';

export type SupportedModel = OpenAIModel | AnthropicModel | GoogleModel;

// =============================================================================
// Multimodal Content Types
// =============================================================================

/** Supported image MIME types */
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Text content part for multimodal messages.
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * Image content part for multimodal messages.
 * Supports both base64-encoded data and URLs.
 */
export interface ImageContent {
  type: 'image';
  /** Image source - either base64 data or URL */
  source: {
    /** Source type: 'base64' for inline data, 'url' for remote images */
    type: 'base64' | 'url';
    /** Base64 encoded image data (required when type: 'base64') */
    data?: string;
    /** Image URL (required when type: 'url') */
    url?: string;
    /** MIME type of the image */
    mediaType: ImageMediaType;
  };
  /** Detail level for image analysis (OpenAI only, default: 'auto') */
  detail?: 'low' | 'high' | 'auto';
}

/**
 * Content can be a simple string or an array of content parts (text/images).
 * Use string for text-only messages, array for multimodal messages.
 */
export type MessageContent = string | (TextContent | ImageContent)[];

/**
 * Check if content is multimodal (array of parts).
 */
export function isMultimodalContent(
  content: MessageContent
): content is (TextContent | ImageContent)[] {
  return Array.isArray(content);
}

/**
 * Check if a content part is an image.
 */
export function isImageContent(part: TextContent | ImageContent): part is ImageContent {
  return part.type === 'image';
}

/**
 * Check if a content part is text.
 */
export function isTextContent(part: TextContent | ImageContent): part is TextContent {
  return part.type === 'text';
}

/**
 * Extract plain text from message content.
 * For multimodal content, concatenates all text parts.
 */
export function getTextFromContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(isTextContent)
    .map((part) => part.text)
    .join('\n');
}

/**
 * Extract all images from message content.
 */
export function getImagesFromContent(content: MessageContent): ImageContent[] {
  if (typeof content === 'string') {
    return [];
  }
  return content.filter(isImageContent);
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  /** Extended thinking configuration (Claude 4.5+ only) */
  thinking?: ExtendedThinkingConfig;
}

/**
 * Configuration for Claude's extended thinking mode.
 * Allows the model to "think" before responding, showing reasoning process.
 */
export interface ExtendedThinkingConfig {
  /** Whether extended thinking is enabled */
  enabled: boolean;
  /** Token budget for the thinking process (default: 1024) */
  budgetTokens?: number;
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown';
  /** Extended thinking content (Claude 4.5+ only, when thinking is enabled) */
  thinking?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  /** Type of content being streamed */
  type?: 'text' | 'thinking';
}

// =============================================================================
// Sandbox Types
// =============================================================================

export interface SandboxOptions {
  timeout?: number; // Execution timeout in ms (default: 10000)
  memoryLimit?: number; // Memory limit in MB (default: 128)
}

export interface SandboxResult {
  output: string; // Captured console output
  error?: string; // Error message if execution failed
  variables: Record<string, unknown>; // Variables in sandbox scope
  executionTime: number; // Time taken in ms
}

export interface SandboxEnvironment {
  execute(code: string): Promise<SandboxResult>;
  setVariable(name: string, value: unknown): void;
  getVariable(name: string): unknown;
  reset(): void;
  dispose(): void;
}

// =============================================================================
// RLM Types
// =============================================================================

export interface RLMOptions {
  model: SupportedModel;
  provider?: ModelProvider; // Auto-detected from model if not specified
  maxIterations?: number; // Max REPL iterations (default: 20)
  maxDepth?: number; // Max recursion depth (default: 1)
  sandboxTimeout?: number; // Sandbox execution timeout (default: 30000)
  verbose?: boolean; // Log execution details (default: false)
  temperature?: number; // LLM temperature (default: 0)
  apiKey?: string; // Override env var API key
  /** Maximum total cost in USD before stopping */
  maxCost?: number;
  /** Maximum total tokens before stopping */
  maxTokens?: number;
  /** Extended thinking configuration (Claude 4.5+ only) */
  extendedThinking?: ExtendedThinkingConfig;
  /** Image content for multimodal queries */
  image?: ImageContent;
}

export interface RLMCompletionOptions {
  stream?: boolean; // Stream results (default: false)
  onStep?: (step: TraceEntry) => void; // Callback for each execution step
}

export interface DryRunResult {
  /** Token estimates */
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Cost estimates */
  cost: {
    estimated: number;
    breakdown: {
      inputCost: number;
      outputCost: number;
    };
    pricing: {
      inputPer1M: number;
      outputPer1M: number;
    };
  };
  /** Configuration that would be used */
  config: {
    model: SupportedModel;
    provider: ModelProvider;
    maxIterations: number;
    maxDepth: number;
    sandboxTimeout: number;
    temperature: number;
  };
  /** Context statistics */
  context: {
    characters: number;
    lines: number;
    estimatedChunks: number;
  };
  /** Available sandbox functions */
  sandboxFunctions: string[];
  /** System prompt preview (truncated) */
  systemPromptPreview: string;
}

export interface RLMResult {
  response: string;
  iterations: number;
  trace: TraceEntry[];
  usage: {
    totalTokens: number;
    totalCalls: number;
    estimatedCost: number;
  };
  executionTime: number;
}

// =============================================================================
// Streaming Types
// =============================================================================

export type RLMStreamEventType =
  | 'start'
  | 'thinking'
  | 'extended_thinking'
  | 'code'
  | 'code_output'
  | 'sub_query'
  | 'sub_response'
  | 'final'
  | 'error'
  | 'done';

export interface StartEventData {
  query: string;
  contextLength: number;
}

export interface ThinkingEventData {
  content: string;
  iteration: number;
}

export interface ExtendedThinkingEventData {
  /** The thinking content from Claude's extended thinking */
  content: string;
  /** Current iteration */
  iteration: number;
  /** Whether this is the complete thinking or a partial stream */
  complete: boolean;
}

export interface CodeEventData {
  code: string;
  iteration: number;
}

export interface CodeOutputEventData {
  output: string;
  error?: string;
  iteration: number;
}

export interface SubQueryEventData {
  prompt: string;
  contextLength: number;
  depth: number;
}

export interface SubResponseEventData {
  response: string;
  depth: number;
}

export interface FinalEventData {
  response: string;
  method: 'FINAL' | 'FINAL_VAR';
}

export interface ErrorEventData {
  message: string;
  code?: RLMErrorCode;
}

export interface DoneEventData {
  usage: RLMResult['usage'];
  executionTime: number;
}

/** Discriminated union of all streaming events */
export type RLMStreamEvent =
  | { type: 'start'; timestamp: number; data: StartEventData }
  | { type: 'thinking'; timestamp: number; data: ThinkingEventData }
  | { type: 'extended_thinking'; timestamp: number; data: ExtendedThinkingEventData }
  | { type: 'code'; timestamp: number; data: CodeEventData }
  | { type: 'code_output'; timestamp: number; data: CodeOutputEventData }
  | { type: 'sub_query'; timestamp: number; data: SubQueryEventData }
  | { type: 'sub_response'; timestamp: number; data: SubResponseEventData }
  | { type: 'final'; timestamp: number; data: FinalEventData }
  | { type: 'error'; timestamp: number; data: ErrorEventData }
  | { type: 'done'; timestamp: number; data: DoneEventData };

export type RLMStreamEventData =
  | StartEventData
  | ThinkingEventData
  | ExtendedThinkingEventData
  | CodeEventData
  | CodeOutputEventData
  | SubQueryEventData
  | SubResponseEventData
  | FinalEventData
  | ErrorEventData
  | DoneEventData;

// =============================================================================
// Trace/Logging Types
// =============================================================================

export type TraceEntryType =
  | 'llm_call'
  | 'code_execution'
  | 'sub_llm_call'
  | 'extended_thinking'
  | 'final_output'
  | 'error';

export interface TraceEntry {
  type: TraceEntryType;
  timestamp: number;
  depth: number;
  data: TraceData;
}

export type TraceData =
  | LLMCallTrace
  | CodeExecutionTrace
  | SubLLMCallTrace
  | ExtendedThinkingTrace
  | FinalOutputTrace
  | ErrorTrace;

export interface LLMCallTrace {
  type: 'llm_call';
  messages: Message[];
  response: string;
  usage: TokenUsage;
}

export interface CodeExecutionTrace {
  type: 'code_execution';
  code: string;
  output: string;
  error?: string;
  executionTime: number;
}

export interface SubLLMCallTrace {
  type: 'sub_llm_call';
  prompt: string;
  contextLength: number;
  response: string;
  usage: TokenUsage;
}

export interface ExtendedThinkingTrace {
  type: 'extended_thinking';
  /** The thinking content from Claude */
  thinking: string;
  /** Token budget that was configured */
  budgetTokens: number;
  /** Iteration during which thinking occurred */
  iteration: number;
}

export interface FinalOutputTrace {
  type: 'final_output';
  output: string;
  method: 'FINAL' | 'FINAL_VAR';
  variableName?: string;
}

export interface ErrorTrace {
  type: 'error';
  message: string;
  stack?: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export const CompletionRequestSchema = z.object({
  query: z.string().min(1),
  context: z.string().optional(),
  options: z
    .object({
      model: z.string().optional(),
      maxIterations: z.number().positive().optional(),
      maxDepth: z.number().nonnegative().optional(),
      maxCost: z.number().positive().optional(),
      maxTokens: z.number().positive().optional(),
      temperature: z.number().min(0).max(2).optional(),
      stream: z.boolean().optional(),
    })
    .optional(),
});

export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;

export interface CompletionResponse {
  success: boolean;
  response?: string;
  trace?: TraceEntry[];
  usage?: RLMResult['usage'];
  error?: string;
}

// =============================================================================
// Utility Types
// =============================================================================

export interface ParsedLLMOutput {
  thinking?: string;
  code?: string;
  final?: {
    type: 'FINAL' | 'FINAL_VAR';
    value: string;
  };
  raw: string;
}

export class RLMError extends Error {
  /** User-friendly suggestion for resolving the error */
  suggestion?: string;

  constructor(
    message: string,
    public code: RLMErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = 'RLMError';
  }
}

export type RLMErrorCode =
  | 'SANDBOX_TIMEOUT'
  | 'SANDBOX_ERROR'
  | 'LLM_ERROR'
  | 'MAX_ITERATIONS'
  | 'MAX_DEPTH'
  | 'PARSE_ERROR'
  | 'INVALID_CONFIG';
