import type {
  Message,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  TokenUsage,
} from '../types.js';

/**
 * Token count result from countTokens().
 */
export interface TokenCount {
  /** Number of tokens in the input */
  tokens: number;
  /** Method used to count tokens */
  method: 'heuristic' | 'tokenizer' | 'api';
}

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

  /**
   * Count tokens for a string or message array.
   * Uses heuristics by default, but specific clients may use tokenizers or API calls.
   */
  countTokens(input: string | Message[]): TokenCount;
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
 * Model pricing lookup table (January 2026).
 * Prices are in USD per 1M tokens.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ==========================================================================
  // OpenAI Models (February 2026)
  // ==========================================================================

  // GPT-5.2 Series (latest flagship)
  'gpt-5.2': { inputPer1M: 5, outputPer1M: 15 },
  'gpt-5.2-codex': { inputPer1M: 2, outputPer1M: 8 },

  // GPT-5.1 Series
  'gpt-5.1': { inputPer1M: 5, outputPer1M: 15 },
  'gpt-5.1-codex': { inputPer1M: 2, outputPer1M: 8 },
  'gpt-5.1-codex-max': { inputPer1M: 3, outputPer1M: 12 },
  'gpt-5.1-codex-mini': { inputPer1M: 0.5, outputPer1M: 2 },

  // GPT-5 Series
  'gpt-5': { inputPer1M: 5, outputPer1M: 15 },
  'gpt-5-mini': { inputPer1M: 1, outputPer1M: 4 },
  'gpt-5-nano': { inputPer1M: 0.25, outputPer1M: 1 },
  'gpt-5-pro': { inputPer1M: 10, outputPer1M: 40 },
  'gpt-5-codex': { inputPer1M: 2, outputPer1M: 8 },

  // GPT-4.1 Series
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'gpt-4.1-nano': { inputPer1M: 0.1, outputPer1M: 0.4 },

  // GPT-4o Series
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },

  // o4 Reasoning Models (latest)
  'o4-mini': { inputPer1M: 1.1, outputPer1M: 4.4 },
  'o4-mini-deep-research': { inputPer1M: 2.5, outputPer1M: 10 },

  // o3 Reasoning Models
  o3: { inputPer1M: 2, outputPer1M: 8 },
  'o3-mini': { inputPer1M: 0.55, outputPer1M: 2.2 },
  'o3-pro': { inputPer1M: 20, outputPer1M: 80 },
  'o3-deep-research': { inputPer1M: 5, outputPer1M: 20 },

  // o1 Reasoning Models (deprecated)
  o1: { inputPer1M: 15, outputPer1M: 60 },
  'o1-mini': { inputPer1M: 3, outputPer1M: 12 },
  'o1-pro': { inputPer1M: 150, outputPer1M: 600 },

  // Legacy OpenAI
  'gpt-4-turbo': { inputPer1M: 10, outputPer1M: 30 },
  'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 },

  // ==========================================================================
  // Anthropic Models (February 2026)
  // ==========================================================================

  // Claude 4.6 Series (latest)
  'claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75 },

  // Claude 4.5 Series (current flagship)
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15 },
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5 },
  'claude-opus-4-5': { inputPer1M: 5, outputPer1M: 25 },
  'claude-sonnet-4-5-20250929': { inputPer1M: 3, outputPer1M: 15 },
  'claude-haiku-4-5-20251001': { inputPer1M: 1, outputPer1M: 5 },
  'claude-opus-4-5-20251101': { inputPer1M: 5, outputPer1M: 25 },

  // Claude 4 Series (legacy)
  'claude-opus-4-1': { inputPer1M: 15, outputPer1M: 75 },

  // Claude 3.x (deprecated)
  'claude-3-5-sonnet-latest': { inputPer1M: 3, outputPer1M: 15 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4 },
  'claude-3-opus-latest': { inputPer1M: 15, outputPer1M: 75 },
  'claude-3-haiku-20240307': { inputPer1M: 0.25, outputPer1M: 1.25 },

  // ==========================================================================
  // Google Gemini Models (February 2026)
  // ==========================================================================

  // Gemini 3 Series (latest)
  'gemini-3-pro-preview': { inputPer1M: 3.5, outputPer1M: 14 },
  'gemini-3-flash-preview': { inputPer1M: 0.5, outputPer1M: 2 },

  // Gemini 2.5 Series (production)
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10 },
  'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.075, outputPer1M: 0.3 },

  // Gemini 2.0 Series
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-2.0-flash-lite': { inputPer1M: 0.075, outputPer1M: 0.3 },
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
export function detectProvider(model: string): 'openai' | 'anthropic' | 'google' {
  if (model.startsWith('claude')) {
    return 'anthropic';
  }
  if (model.startsWith('gemini')) {
    return 'google';
  }
  return 'openai';
}
