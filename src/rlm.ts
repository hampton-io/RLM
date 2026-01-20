import type { RLMOptions, RLMCompletionOptions, RLMResult, RLMStreamEvent, SupportedModel } from './types.js';
import { RLMExecutor } from './executor.js';
import { RLMStreamingExecutor } from './streaming-executor.js';
import { detectProvider } from './clients/types.js';
import { invalidConfigError } from './utils/errors.js';

/**
 * Recursive Language Model (RLM) - Main class.
 *
 * Enables LLMs to process arbitrarily long contexts by treating them as
 * an external environment that can be programmatically explored via a
 * JavaScript REPL.
 *
 * @example
 * ```typescript
 * import { RLM } from 'rlm';
 *
 * const rlm = new RLM({ model: 'gpt-4o-mini' });
 *
 * const result = await rlm.completion(
 *   "Find all mentions of 'climate change' in this document",
 *   veryLongDocument
 * );
 *
 * console.log(result.response);
 * ```
 *
 * @example Streaming
 * ```typescript
 * const rlm = new RLM({ model: 'gpt-4o-mini' });
 *
 * for await (const event of rlm.stream("Find the answer", context)) {
 *   console.log(event.type, event.data);
 * }
 * ```
 */
export class RLM {
  private options: RLMOptions;
  private executor: RLMExecutor;
  private streamingExecutor: RLMStreamingExecutor;

  /**
   * Create a new RLM instance.
   *
   * @param options - Configuration options
   */
  constructor(options: RLMOptions) {
    this.validateOptions(options);
    this.options = {
      provider: detectProvider(options.model),
      ...options,
    };
    this.executor = new RLMExecutor(this.options);
    this.streamingExecutor = new RLMStreamingExecutor(this.options);
  }

  /**
   * Generate a completion using the RLM approach.
   *
   * The query is processed in a REPL environment where the LLM can
   * write code to explore and manipulate the context, make recursive
   * sub-queries, and produce a final answer.
   *
   * @param query - The question or task to perform
   * @param context - Optional context string (can be very large)
   * @param options - Optional completion options
   * @returns The result including response, trace, and usage stats
   */
  async completion(
    query: string,
    context?: string,
    options?: RLMCompletionOptions
  ): Promise<RLMResult> {
    if (!query || typeof query !== 'string') {
      throw invalidConfigError('Query must be a non-empty string');
    }

    return this.executor.execute(query, context ?? '', options ?? {});
  }

  /**
   * Generate a streaming completion using the RLM approach.
   *
   * Yields events as they occur during execution, allowing real-time
   * progress updates.
   *
   * @param query - The question or task to perform
   * @param context - Optional context string (can be very large)
   * @returns AsyncGenerator yielding stream events, returns final result
   *
   * @example
   * ```typescript
   * const rlm = new RLM({ model: 'gpt-4o-mini' });
   *
   * const stream = rlm.stream("Find the answer", context);
   *
   * for await (const event of stream) {
   *   switch (event.type) {
   *     case 'thinking':
   *       console.log('Thinking:', event.data.content);
   *       break;
   *     case 'code':
   *       console.log('Executing code:', event.data.code);
   *       break;
   *     case 'final':
   *       console.log('Answer:', event.data.response);
   *       break;
   *   }
   * }
   * ```
   */
  stream(
    query: string,
    context?: string
  ): AsyncGenerator<RLMStreamEvent, RLMResult, unknown> {
    if (!query || typeof query !== 'string') {
      throw invalidConfigError('Query must be a non-empty string');
    }

    return this.streamingExecutor.executeStream(query, context ?? '');
  }

  /**
   * Get the configured model.
   */
  get model(): SupportedModel {
    return this.options.model;
  }

  /**
   * Get the configured provider.
   */
  get provider(): string {
    return this.options.provider ?? detectProvider(this.options.model);
  }

  /**
   * Validate configuration options.
   */
  private validateOptions(options: RLMOptions): void {
    if (!options.model) {
      throw invalidConfigError('Model is required');
    }

    if (options.maxIterations !== undefined && options.maxIterations < 1) {
      throw invalidConfigError('maxIterations must be at least 1');
    }

    if (options.maxDepth !== undefined && options.maxDepth < 0) {
      throw invalidConfigError('maxDepth must be non-negative');
    }

    if (options.sandboxTimeout !== undefined && options.sandboxTimeout < 1000) {
      throw invalidConfigError('sandboxTimeout must be at least 1000ms');
    }

    if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
      throw invalidConfigError('temperature must be between 0 and 2');
    }
  }
}
