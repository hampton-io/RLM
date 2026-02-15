import type {
  RLMOptions,
  RLMCompletionOptions,
  RLMResult,
  RLMStreamEvent,
  SupportedModel,
  DryRunResult,
} from './types.js';
import { RLMExecutor } from './executor.js';
import { RLMStreamingExecutor } from './streaming-executor.js';
import { detectProvider, MODEL_PRICING } from './clients/types.js';
import { invalidConfigError } from './utils/errors.js';
import { estimateTotalCost } from './utils/tokens.js';
import { getSystemPrompt } from './prompts/index.js';

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
  stream(query: string, context?: string): AsyncGenerator<RLMStreamEvent, RLMResult, unknown> {
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
   * Perform a dry run to estimate tokens, cost, and show configuration.
   *
   * This is a static method that does NOT require API keys or full RLM instantiation.
   * It analyzes the query and context to provide estimates of what execution would cost.
   *
   * @param query - The question or task to perform
   * @param context - Optional context string
   * @param options - RLM options (only model and config options needed, no apiKey required)
   * @returns Dry run result with estimates and configuration
   *
   * @example
   * ```typescript
   * const dryRun = RLM.dryRun(
   *   "Analyze this",
   *   veryLongDocument,
   *   { model: 'gpt-4o-mini' }
   * );
   *
   * console.log(`Estimated cost: $${dryRun.cost.estimated.toFixed(4)}`);
   * console.log(`Estimated tokens: ${dryRun.tokens.totalTokens}`);
   * ```
   */
  static dryRun(query: string, context: string | undefined, options: RLMOptions): DryRunResult {
    if (!query || typeof query !== 'string') {
      throw invalidConfigError('Query must be a non-empty string');
    }

    if (!options.model) {
      throw invalidConfigError('Model is required for dry run');
    }

    const ctx = context ?? '';
    const provider = options.provider ?? detectProvider(options.model);
    const maxIterations = options.maxIterations ?? 20;

    // Get cost estimate
    const costEstimate = estimateTotalCost(query, ctx, options.model, {
      estimatedIterations: Math.min(maxIterations, 5), // Assume ~5 iterations typical
    });

    // Get pricing
    const pricing = MODEL_PRICING[options.model] ?? { inputPer1M: 0, outputPer1M: 0 };

    // Get system prompt preview
    const systemPrompt = getSystemPrompt();
    const systemPromptPreview =
      systemPrompt.length > 500 ? systemPrompt.slice(0, 500) + '...' : systemPrompt;

    // Calculate context stats
    const lines = ctx ? ctx.split('\n').length : 0;
    const chunkSize = 4000; // ~4000 chars per chunk
    const estimatedChunks = ctx ? Math.ceil(ctx.length / chunkSize) : 0;

    // Available sandbox functions
    const sandboxFunctions = [
      'context - The full context string',
      'llm_query(prompt, subContext?) - Make a recursive LLM call',
      'llm_query_parallel(queries) - Make parallel recursive calls',
      'print(...args) - Print output (visible to LLM)',
      'chunk(text, size) - Split text into chunks',
      'grep(text, pattern) - Search for patterns',
      'len(text) - Get text length',
      'FINAL(answer) - Return final answer',
      'FINAL_VAR(varName) - Return variable as answer',
    ];

    return {
      tokens: {
        inputTokens: costEstimate.tokens.inputTokens,
        outputTokens: costEstimate.tokens.outputTokens,
        totalTokens: costEstimate.tokens.totalTokens,
      },
      cost: {
        estimated: costEstimate.cost,
        breakdown: costEstimate.breakdown,
        pricing: {
          inputPer1M: pricing.inputPer1M,
          outputPer1M: pricing.outputPer1M,
        },
      },
      config: {
        model: options.model,
        provider,
        maxIterations,
        maxDepth: options.maxDepth ?? 1,
        sandboxTimeout: options.sandboxTimeout ?? 30000,
        temperature: options.temperature ?? 0,
      },
      context: {
        characters: ctx.length,
        lines,
        estimatedChunks,
      },
      sandboxFunctions,
      systemPromptPreview,
    };
  }

  /**
   * Format a dry run result for display.
   */
  static formatDryRun(result: DryRunResult): string {
    const lines = [
      '=== RLM Dry Run ===',
      '',
      '--- Configuration ---',
      `Model: ${result.config.model} (${result.config.provider})`,
      `Max Iterations: ${result.config.maxIterations}`,
      `Max Depth: ${result.config.maxDepth}`,
      `Sandbox Timeout: ${result.config.sandboxTimeout}ms`,
      `Temperature: ${result.config.temperature}`,
      '',
      '--- Context ---',
      `Characters: ${result.context.characters.toLocaleString()}`,
      `Lines: ${result.context.lines.toLocaleString()}`,
      `Estimated Chunks: ${result.context.estimatedChunks}`,
      '',
      '--- Token Estimate ---',
      `Input Tokens: ${result.tokens.inputTokens.toLocaleString()}`,
      `Output Tokens: ${result.tokens.outputTokens.toLocaleString()}`,
      `Total Tokens: ${result.tokens.totalTokens.toLocaleString()}`,
      '',
      '--- Cost Estimate ---',
      `Input Cost: $${result.cost.breakdown.inputCost.toFixed(6)}`,
      `Output Cost: $${result.cost.breakdown.outputCost.toFixed(6)}`,
      `Total Cost: $${result.cost.estimated.toFixed(6)}`,
      '',
      `Pricing (per 1M tokens):`,
      `  Input: $${result.cost.pricing.inputPer1M.toFixed(2)}`,
      `  Output: $${result.cost.pricing.outputPer1M.toFixed(2)}`,
      '',
      '--- Available Sandbox Functions ---',
      ...result.sandboxFunctions.map((f) => `  ${f}`),
      '',
      '--- System Prompt Preview ---',
      result.systemPromptPreview,
      '',
      '===================',
      'Note: Estimates assume ~5 iterations. Actual usage may vary.',
    ];

    return lines.join('\n');
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
