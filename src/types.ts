import { z } from 'zod';

// =============================================================================
// LLM Client Types
// =============================================================================

export type ModelProvider = 'openai' | 'anthropic';

export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-3.5-turbo';
export type AnthropicModel = 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest' | 'claude-3-opus-latest';
export type SupportedModel = OpenAIModel | AnthropicModel;

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

// =============================================================================
// Sandbox Types
// =============================================================================

export interface SandboxOptions {
  timeout?: number;        // Execution timeout in ms (default: 10000)
  memoryLimit?: number;    // Memory limit in MB (default: 128)
}

export interface SandboxResult {
  output: string;          // Captured console output
  error?: string;          // Error message if execution failed
  variables: Record<string, unknown>;  // Variables in sandbox scope
  executionTime: number;   // Time taken in ms
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
  provider?: ModelProvider;      // Auto-detected from model if not specified
  maxIterations?: number;        // Max REPL iterations (default: 20)
  maxDepth?: number;             // Max recursion depth (default: 1)
  sandboxTimeout?: number;       // Sandbox execution timeout (default: 10000)
  verbose?: boolean;             // Log execution details (default: false)
  temperature?: number;          // LLM temperature (default: 0)
  apiKey?: string;               // Override env var API key
}

export interface RLMCompletionOptions {
  stream?: boolean;              // Stream results (default: false)
  onStep?: (step: TraceEntry) => void;  // Callback for each execution step
}

export interface RLMResult {
  response: string;
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
  options: z.object({
    model: z.string().optional(),
    maxIterations: z.number().positive().optional(),
    maxDepth: z.number().nonnegative().optional(),
    temperature: z.number().min(0).max(2).optional(),
    stream: z.boolean().optional(),
  }).optional(),
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
