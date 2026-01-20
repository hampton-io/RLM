/**
 * Model Fallback Chain - Automatic retry with next model on failure.
 *
 * Provides resilient LLM execution by falling back to alternative models
 * when the primary model fails.
 */

import type { SupportedModel, ModelProvider, Message, CompletionOptions, CompletionResult, StreamChunk } from './types.js';
import type { LLMClient, LLMClientConfig, TokenCount } from './clients/types.js';
import { createClient, detectProvider } from './clients/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Event emitted when a fallback occurs.
 */
export interface FallbackEvent {
  /** Timestamp of the fallback */
  timestamp: number;
  /** Model that failed */
  failedModel: SupportedModel;
  /** Error that caused the fallback */
  error: Error;
  /** Model being tried next */
  nextModel: SupportedModel;
  /** Attempt number (1-indexed) */
  attempt: number;
  /** Total models in the chain */
  totalModels: number;
}

/**
 * Options for the fallback chain.
 */
export interface FallbackChainOptions {
  /** Ordered list of models to try */
  models: SupportedModel[];
  /** Client configuration (shared across all models) */
  clientConfig?: LLMClientConfig;
  /** Callback when fallback occurs */
  onFallback?: (event: FallbackEvent) => void;
  /** Whether to retry on rate limit errors (default: true) */
  retryOnRateLimit?: boolean;
  /** Whether to retry on timeout errors (default: true) */
  retryOnTimeout?: boolean;
  /** Whether to retry on server errors (default: true) */
  retryOnServerError?: boolean;
  /** Custom error filter - return true to trigger fallback */
  shouldFallback?: (error: Error) => boolean;
}

/**
 * Result from fallback chain execution.
 */
export interface FallbackChainResult<T> {
  /** The result from the successful model */
  result: T;
  /** Model that succeeded */
  model: SupportedModel;
  /** Number of attempts made */
  attempts: number;
  /** Models that failed (in order) */
  failedModels: Array<{ model: SupportedModel; error: Error }>;
}

// =============================================================================
// Default Fallback Chains
// =============================================================================

/**
 * Default fallback chains by provider.
 * Models are ordered from fastest/cheapest to most capable.
 */
export const DEFAULT_FALLBACK_CHAINS: Record<ModelProvider, SupportedModel[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-5-mini', 'gpt-5'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
};

/**
 * Cost-optimized fallback chain (cheapest models first).
 */
export const COST_OPTIMIZED_CHAIN: SupportedModel[] = [
  'gemini-2.0-flash-lite',
  'gpt-4o-mini',
  'gemini-2.5-flash',
  'claude-haiku-4-5',
  'gpt-4.1-mini',
  'gpt-4o',
  'claude-sonnet-4-5',
  'gpt-5-mini',
];

/**
 * Quality-optimized fallback chain (best models first).
 */
export const QUALITY_OPTIMIZED_CHAIN: SupportedModel[] = [
  'gpt-5',
  'claude-opus-4-5',
  'gpt-4.1',
  'claude-sonnet-4-5',
  'gpt-4o',
  'gemini-2.5-pro',
  'gpt-4o-mini',
  'claude-haiku-4-5',
];

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Check if an error is a rate limit error.
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  );
}

/**
 * Check if an error is a timeout error.
 */
export function isTimeoutError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deadline exceeded')
  );
}

/**
 * Check if an error is a server error (5xx).
 */
export function isServerError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error') ||
    message.includes('service unavailable') ||
    message.includes('bad gateway')
  );
}

/**
 * Check if an error is retryable (should trigger fallback).
 */
export function isRetryableError(
  error: Error,
  options: FallbackChainOptions
): boolean {
  const { retryOnRateLimit = true, retryOnTimeout = true, retryOnServerError = true, shouldFallback } = options;

  // Custom filter takes precedence
  if (shouldFallback) {
    return shouldFallback(error);
  }

  // Check error types
  if (retryOnRateLimit && isRateLimitError(error)) return true;
  if (retryOnTimeout && isTimeoutError(error)) return true;
  if (retryOnServerError && isServerError(error)) return true;

  return false;
}

// =============================================================================
// Fallback Chain Client
// =============================================================================

/**
 * A client that wraps multiple models with automatic fallback.
 */
export class FallbackChainClient implements LLMClient {
  readonly provider: string;
  readonly model: string;

  private options: Required<FallbackChainOptions>;
  private clients: Map<SupportedModel, LLMClient> = new Map();

  constructor(options: FallbackChainOptions) {
    if (!options.models || options.models.length === 0) {
      throw new Error('FallbackChainClient requires at least one model');
    }

    this.options = {
      models: options.models,
      clientConfig: options.clientConfig ?? {},
      onFallback: options.onFallback ?? (() => {}),
      retryOnRateLimit: options.retryOnRateLimit ?? true,
      retryOnTimeout: options.retryOnTimeout ?? true,
      retryOnServerError: options.retryOnServerError ?? true,
      shouldFallback: options.shouldFallback ?? undefined,
    } as Required<FallbackChainOptions>;

    // Set primary model info
    this.model = options.models[0];
    this.provider = detectProvider(options.models[0]);
  }

  /**
   * Get or create a client for a specific model.
   */
  private getClient(model: SupportedModel): LLMClient {
    if (!this.clients.has(model)) {
      const client = createClient(model, this.options.clientConfig);
      this.clients.set(model, client);
    }
    return this.clients.get(model)!;
  }

  /**
   * Execute with fallback chain.
   */
  private async executeWithFallback<T>(
    operation: (client: LLMClient) => Promise<T>
  ): Promise<FallbackChainResult<T>> {
    const failedModels: Array<{ model: SupportedModel; error: Error }> = [];
    let attempt = 0;

    for (const model of this.options.models) {
      attempt++;
      const client = this.getClient(model);

      try {
        const result = await operation(client);
        return {
          result,
          model,
          attempts: attempt,
          failedModels,
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        failedModels.push({ model, error: err });

        // Check if we should try the next model
        const isLast = attempt === this.options.models.length;
        if (isLast || !isRetryableError(err, this.options)) {
          // Don't fallback - throw the error
          throw err;
        }

        // Emit fallback event
        const nextModel = this.options.models[attempt];
        this.options.onFallback({
          timestamp: Date.now(),
          failedModel: model,
          error: err,
          nextModel,
          attempt,
          totalModels: this.options.models.length,
        });
      }
    }

    // Should never reach here, but TypeScript needs this
    throw new Error('All models in fallback chain failed');
  }

  /**
   * Generate a completion with automatic fallback.
   */
  async completion(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const result = await this.executeWithFallback((client) =>
      client.completion(messages, options)
    );
    return result.result;
  }

  /**
   * Generate a streaming completion.
   *
   * Note: Streaming with fallback is more complex. If the stream fails
   * mid-way, we cannot easily resume. This implementation only falls back
   * if the initial connection fails.
   */
  async *streamCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, CompletionResult, unknown> {
    const failedModels: Array<{ model: SupportedModel; error: Error }> = [];
    let attempt = 0;

    for (const model of this.options.models) {
      attempt++;
      const client = this.getClient(model);

      try {
        // Try to get the stream and its first chunk
        const generator = client.streamCompletion(messages, options);
        const firstChunk = await generator.next();

        // If we got here, the connection succeeded
        // Yield the first chunk if not done
        if (!firstChunk.done) {
          yield firstChunk.value;
        } else {
          return firstChunk.value;
        }

        // Yield remaining chunks
        return yield* generator;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        failedModels.push({ model, error: err });

        // Check if we should try the next model
        const isLast = attempt === this.options.models.length;
        if (isLast || !isRetryableError(err, this.options)) {
          throw err;
        }

        // Emit fallback event
        const nextModel = this.options.models[attempt];
        this.options.onFallback({
          timestamp: Date.now(),
          failedModel: model,
          error: err,
          nextModel,
          attempt,
          totalModels: this.options.models.length,
        });
      }
    }

    throw new Error('All models in fallback chain failed');
  }

  /**
   * Count tokens using the primary model's client.
   */
  countTokens(input: string | Message[]): TokenCount {
    const client = this.getClient(this.options.models[0]);
    return client.countTokens(input);
  }

  /**
   * Get the list of models in the fallback chain.
   */
  getModels(): SupportedModel[] {
    return [...this.options.models];
  }

  /**
   * Add a model to the end of the fallback chain.
   */
  addModel(model: SupportedModel): void {
    if (!this.options.models.includes(model)) {
      this.options.models.push(model);
    }
  }

  /**
   * Remove a model from the fallback chain.
   */
  removeModel(model: SupportedModel): boolean {
    const index = this.options.models.indexOf(model);
    if (index > -1) {
      this.options.models.splice(index, 1);
      this.clients.delete(model);
      return true;
    }
    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a fallback chain client.
 */
export function createFallbackChain(options: FallbackChainOptions): FallbackChainClient {
  return new FallbackChainClient(options);
}

/**
 * Create a fallback chain for a specific provider.
 */
export function createProviderFallbackChain(
  provider: ModelProvider,
  clientConfig?: LLMClientConfig,
  onFallback?: (event: FallbackEvent) => void
): FallbackChainClient {
  return new FallbackChainClient({
    models: DEFAULT_FALLBACK_CHAINS[provider],
    clientConfig,
    onFallback,
  });
}

/**
 * Create a cost-optimized fallback chain.
 */
export function createCostOptimizedChain(
  clientConfig?: LLMClientConfig,
  onFallback?: (event: FallbackEvent) => void
): FallbackChainClient {
  return new FallbackChainClient({
    models: COST_OPTIMIZED_CHAIN,
    clientConfig,
    onFallback,
  });
}

/**
 * Create a quality-optimized fallback chain.
 */
export function createQualityOptimizedChain(
  clientConfig?: LLMClientConfig,
  onFallback?: (event: FallbackEvent) => void
): FallbackChainClient {
  return new FallbackChainClient({
    models: QUALITY_OPTIMIZED_CHAIN,
    clientConfig,
    onFallback,
  });
}

/**
 * Wrap an existing operation with fallback support.
 */
export async function withFallback<T>(
  operation: (model: SupportedModel) => Promise<T>,
  models: SupportedModel[],
  options?: Partial<FallbackChainOptions>
): Promise<FallbackChainResult<T>> {
  const failedModels: Array<{ model: SupportedModel; error: Error }> = [];
  const opts = {
    retryOnRateLimit: options?.retryOnRateLimit ?? true,
    retryOnTimeout: options?.retryOnTimeout ?? true,
    retryOnServerError: options?.retryOnServerError ?? true,
    shouldFallback: options?.shouldFallback,
    onFallback: options?.onFallback ?? (() => {}),
  };

  let attempt = 0;

  for (const model of models) {
    attempt++;

    try {
      const result = await operation(model);
      return {
        result,
        model,
        attempts: attempt,
        failedModels,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      failedModels.push({ model, error: err });

      const isLast = attempt === models.length;
      if (isLast || !isRetryableError(err, opts as FallbackChainOptions)) {
        throw err;
      }

      const nextModel = models[attempt];
      opts.onFallback({
        timestamp: Date.now(),
        failedModel: model,
        error: err,
        nextModel,
        attempt,
        totalModels: models.length,
      });
    }
  }

  throw new Error('All models failed');
}
