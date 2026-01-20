import type {
  Message,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  TokenUsage,
} from '../types.js';

/**
 * Base interface for LLM clients.
 * All provider-specific clients must implement this interface.
 */
export interface LLMClient {
  /** Provider name (e.g., 'openai', 'anthropic') */
  readonly provider: string;

  /** Model identifier */
  readonly model: string;

  /**
   * Generate a completion for the given messages.
   */
  completion(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;

  /**
   * Generate a streaming completion.
   * Yields chunks as they arrive from the API.
   */
  streamCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, CompletionResult, unknown>;
}

/**
 * Configuration for creating an LLM client.
 */
export interface LLMClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Model pricing information for cost estimation.
 * Prices are in USD per 1M tokens.
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Model pricing lookup table.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI models
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4-turbo': { inputPer1M: 10, outputPer1M: 30 },
  'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },

  // Anthropic models
  'claude-3-5-sonnet-latest': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4 },
  'claude-3-opus-latest': { inputPer1M: 15, outputPer1M: 75 },
};

/**
 * Calculate estimated cost for token usage.
 */
export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0;
  }

  const inputCost = (usage.promptTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + outputCost;
}

/**
 * Detect provider from model name.
 */
export function detectProvider(model: string): 'openai' | 'anthropic' {
  if (model.startsWith('claude')) {
    return 'anthropic';
  }
  return 'openai';
}
