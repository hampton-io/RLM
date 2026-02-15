import type { LLMClient, TokenCount } from './types.js';
import type { Message, CompletionOptions, CompletionResult, StreamChunk } from '../types.js';
import { withRetry, type RetryOptions, isRetryableError } from '../utils/retry.js';

/**
 * Options for the resilient client wrapper.
 */
export interface ResilientClientOptions extends RetryOptions {
  /** Whether to log retry attempts (default: false) */
  logRetries?: boolean;
  /** Custom logger function */
  logger?: (message: string) => void;
}

/**
 * A wrapper that adds retry logic to any LLM client.
 *
 * @example
 * ```typescript
 * const baseClient = new OpenAIClient('gpt-4o-mini', config);
 * const resilientClient = new ResilientClient(baseClient, {
 *   maxRetries: 5,
 *   logRetries: true,
 * });
 * ```
 */
export class ResilientClient implements LLMClient {
  readonly model: string;
  readonly provider: string;
  private client: LLMClient;
  private options: Required<ResilientClientOptions>;

  constructor(client: LLMClient, options: ResilientClientOptions = {}) {
    this.client = client;
    this.model = client.model;
    this.provider = client.provider;
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      initialDelay: options.initialDelay ?? 1000,
      maxDelay: options.maxDelay ?? 60000,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      jitter: options.jitter ?? 0.2,
      isRetryable: options.isRetryable ?? isRetryableError,
      onRetry: options.onRetry ?? this.defaultOnRetry.bind(this),
      logRetries: options.logRetries ?? false,
      logger: options.logger ?? console.log,
    };
  }

  /**
   * Default retry callback that logs attempts.
   */
  private defaultOnRetry(error: unknown, attempt: number, delay: number): void {
    if (this.options.logRetries) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.options.logger(
        `[RLM] Retry attempt ${attempt}/${this.options.maxRetries} after ${delay}ms: ${errorMessage}`
      );
    }
  }

  /**
   * Execute a completion with retry logic.
   */
  async completion(messages: Message[], options?: CompletionOptions): Promise<CompletionResult> {
    return withRetry(() => this.client.completion(messages, options), {
      maxRetries: this.options.maxRetries,
      initialDelay: this.options.initialDelay,
      maxDelay: this.options.maxDelay,
      backoffMultiplier: this.options.backoffMultiplier,
      jitter: this.options.jitter,
      isRetryable: this.options.isRetryable,
      onRetry: this.options.onRetry,
    });
  }

  /**
   * Execute a streaming completion with retry logic.
   *
   * Note: Streaming retries only happen on initial connection failure.
   * Once streaming has started, the stream is returned and failures
   * during streaming are not retried.
   */
  async *streamCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, CompletionResult, unknown> {
    // Retry getting the stream generator and its first chunk
    // This ensures connection errors are caught by retry logic
    const { generator, firstChunk } = await withRetry(
      async () => {
        const gen = this.client.streamCompletion(messages, options);
        // Get first chunk to verify connection works
        const first = await gen.next();
        return { generator: gen, firstChunk: first };
      },
      {
        maxRetries: this.options.maxRetries,
        initialDelay: this.options.initialDelay,
        maxDelay: this.options.maxDelay,
        backoffMultiplier: this.options.backoffMultiplier,
        jitter: this.options.jitter,
        isRetryable: this.options.isRetryable,
        onRetry: this.options.onRetry,
      }
    );

    // Yield the first chunk if it wasn't done
    if (!firstChunk.done) {
      yield firstChunk.value;
    } else {
      // First chunk was the return value
      return firstChunk.value;
    }

    // Yield remaining chunks from the generator
    return yield* generator;
  }

  /**
   * Count tokens for a string or message array.
   * Delegates to the underlying client.
   */
  countTokens(input: string | Message[]): TokenCount {
    return this.client.countTokens(input);
  }

  /**
   * Get the underlying client.
   */
  getUnderlyingClient(): LLMClient {
    return this.client;
  }

  /**
   * Update retry options.
   */
  setOptions(options: Partial<ResilientClientOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }
}

/**
 * Create a resilient wrapper around any LLM client.
 */
export function createResilientClient(
  client: LLMClient,
  options?: ResilientClientOptions
): ResilientClient {
  return new ResilientClient(client, options);
}

/**
 * Wrap a function to add retry logic.
 * Useful for wrapping individual methods without using the full ResilientClient.
 */
export function withLLMRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: RetryOptions
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args), options);
  }) as T;
}
