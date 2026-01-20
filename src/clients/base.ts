import type { Message, CompletionOptions, CompletionResult, StreamChunk, ModelProvider } from '../types.js';
import type { LLMClient, LLMClientConfig, TokenCount } from './types.js';
import { estimateTokensForString, estimateTokensForMessages } from '../utils/tokens.js';

/**
 * Abstract base class for LLM clients.
 * Provides common functionality like retry logic and error handling.
 */
export abstract class BaseLLMClient implements LLMClient {
  abstract readonly provider: ModelProvider;
  abstract readonly model: string;

  protected config: Required<LLMClientConfig>;

  constructor(config: LLMClientConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? '',
      baseUrl: config.baseUrl ?? '',
      timeout: config.timeout ?? 60000,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  abstract completion(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;

  abstract streamCompletion(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk, CompletionResult, unknown>;

  /**
   * Count tokens for a string or message array.
   * Uses provider-specific heuristics by default.
   * Subclasses can override to use tokenizers or API calls.
   */
  countTokens(input: string | Message[]): TokenCount {
    let tokens: number;

    if (typeof input === 'string') {
      tokens = estimateTokensForString(input, this.provider);
    } else {
      tokens = estimateTokensForMessages(input, this.provider);
    }

    return {
      tokens,
      method: 'heuristic',
    };
  }

  /**
   * Retry a function with exponential backoff.
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    retries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === retries) {
          break;
        }

        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if an error should not be retried.
   */
  protected isNonRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Authentication errors
      if (message.includes('api key') || message.includes('unauthorized') || message.includes('401')) {
        return true;
      }

      // Invalid request errors
      if (message.includes('invalid') || message.includes('400')) {
        return true;
      }

      // Content policy violations
      if (message.includes('content policy') || message.includes('content_filter')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Sleep for the specified duration.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
