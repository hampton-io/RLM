/**
 * Batch processing support for RLM.
 *
 * Process multiple queries in parallel with configurable concurrency,
 * progress tracking, and error handling.
 */

import type { RLMResult, RLMCompletionOptions } from './types.js';

/**
 * A single batch item to process.
 */
export interface BatchItem {
  /** Unique identifier for this item */
  id: string;
  /** The query to process */
  query: string;
  /** Optional context for this query */
  context?: string;
  /** Optional item-specific options */
  options?: RLMCompletionOptions;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of processing a batch item.
 */
export interface BatchItemResult {
  /** The item ID */
  id: string;
  /** Whether processing succeeded */
  success: boolean;
  /** The result if successful */
  result?: RLMResult;
  /** The error if failed */
  error?: Error;
  /** Processing time in ms */
  processingTime: number;
  /** Item metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for batch processing.
 */
export interface BatchOptions {
  /** Maximum concurrent requests (default: 3) */
  concurrency?: number;
  /** Whether to continue on errors (default: true) */
  continueOnError?: boolean;
  /** Maximum retries per item (default: 2) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;
  /** Item completion callback */
  onItemComplete?: (result: BatchItemResult) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Batch processing progress.
 */
export interface BatchProgress {
  /** Total items to process */
  total: number;
  /** Items completed (success + failed) */
  completed: number;
  /** Successful items */
  succeeded: number;
  /** Failed items */
  failed: number;
  /** Currently processing items */
  inProgress: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining: number;
  /** Average processing time per item */
  averageProcessingTime: number;
}

/**
 * Result of batch processing.
 */
export interface BatchResult {
  /** All item results */
  results: BatchItemResult[];
  /** Summary statistics */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    totalTime: number;
    averageTime: number;
    totalTokens: number;
    totalCost: number;
  };
}

/**
 * Batch processor for RLM completions.
 *
 * @example
 * ```typescript
 * import { RLM } from 'rlm';
 * import { BatchProcessor } from 'rlm';
 *
 * const rlm = new RLM({ model: 'gpt-4o-mini' });
 * const processor = new BatchProcessor(rlm);
 *
 * const items = [
 *   { id: '1', query: 'What is X?', context: doc1 },
 *   { id: '2', query: 'What is Y?', context: doc2 },
 *   { id: '3', query: 'What is Z?', context: doc3 },
 * ];
 *
 * const result = await processor.process(items, {
 *   concurrency: 2,
 *   onProgress: (p) => console.log(`${p.percentage}% complete`),
 * });
 *
 * console.log(`Completed: ${result.summary.succeeded}/${result.summary.total}`);
 * ```
 */
export class BatchProcessor {
  private rlm: {
    completion: (
      query: string,
      context?: string,
      options?: RLMCompletionOptions
    ) => Promise<RLMResult>;
  };

  constructor(rlm: {
    completion: (
      query: string,
      context?: string,
      options?: RLMCompletionOptions
    ) => Promise<RLMResult>;
  }) {
    this.rlm = rlm;
  }

  /**
   * Process a batch of items.
   */
  async process(items: BatchItem[], options: BatchOptions = {}): Promise<BatchResult> {
    const {
      concurrency = 3,
      continueOnError = true,
      maxRetries = 2,
      retryDelay = 1000,
      onProgress,
      onItemComplete,
      signal,
    } = options;

    const startTime = Date.now();
    const results: BatchItemResult[] = [];
    const processingTimes: number[] = [];

    let completed = 0;
    let succeeded = 0;
    let failed = 0;
    let inProgress = 0;

    const reportProgress = () => {
      if (!onProgress) return;

      const avgTime =
        processingTimes.length > 0
          ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
          : 0;

      const remaining = items.length - completed;
      const estimatedRemaining = avgTime * remaining;

      onProgress({
        total: items.length,
        completed,
        succeeded,
        failed,
        inProgress,
        percentage: Math.round((completed / items.length) * 100),
        estimatedTimeRemaining: estimatedRemaining,
        averageProcessingTime: avgTime,
      });
    };

    // Process items with concurrency limit
    const queue = [...items];
    const activePromises: Promise<void>[] = [];

    const processItem = async (item: BatchItem): Promise<BatchItemResult> => {
      const itemStart = Date.now();
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        // Check for abort
        if (signal?.aborted) {
          return {
            id: item.id,
            success: false,
            error: new Error('Batch processing aborted'),
            processingTime: Date.now() - itemStart,
            metadata: item.metadata,
          };
        }

        try {
          const result = await this.rlm.completion(item.query, item.context, item.options);

          return {
            id: item.id,
            success: true,
            result,
            processingTime: Date.now() - itemStart,
            metadata: item.metadata,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < maxRetries) {
            await this.delay(retryDelay * (attempt + 1)); // Exponential backoff
          }
        }
      }

      return {
        id: item.id,
        success: false,
        error: lastError,
        processingTime: Date.now() - itemStart,
        metadata: item.metadata,
      };
    };

    const processNext = async (): Promise<void> => {
      while (queue.length > 0) {
        // Check for abort
        if (signal?.aborted) {
          return;
        }

        const item = queue.shift();
        if (!item) return;

        inProgress++;
        reportProgress();

        const result = await processItem(item);

        inProgress--;
        completed++;

        if (result.success) {
          succeeded++;
        } else {
          failed++;
          if (!continueOnError) {
            // Clear remaining queue
            queue.length = 0;
          }
        }

        processingTimes.push(result.processingTime);
        results.push(result);

        onItemComplete?.(result);
        reportProgress();
      }
    };

    // Start workers
    for (let i = 0; i < Math.min(concurrency, items.length); i++) {
      activePromises.push(processNext());
    }

    await Promise.all(activePromises);

    // Calculate summary
    const totalTime = Date.now() - startTime;
    let totalTokens = 0;
    let totalCost = 0;

    for (const result of results) {
      if (result.success && result.result) {
        totalTokens += result.result.usage.totalTokens;
        totalCost += result.result.usage.estimatedCost;
      }
    }

    return {
      results,
      summary: {
        total: items.length,
        succeeded,
        failed,
        totalTime,
        averageTime: totalTime / items.length,
        totalTokens,
        totalCost,
      },
    };
  }

  /**
   * Process items as an async generator for streaming results.
   */
  async *processStream(
    items: BatchItem[],
    options: BatchOptions = {}
  ): AsyncGenerator<BatchItemResult, BatchResult['summary'], unknown> {
    const {
      concurrency = 3,
      continueOnError = true,
      maxRetries = 2,
      retryDelay = 1000,
      signal,
    } = options;

    const startTime = Date.now();
    const processingTimes: number[] = [];
    let succeeded = 0;
    let failed = 0;
    let totalTokens = 0;
    let totalCost = 0;

    // Create a channel-like mechanism
    const results: BatchItemResult[] = [];
    let resolveNext: ((value: BatchItemResult | undefined) => void) | null = null;
    let itemsCompleted = 0;

    const enqueueResult = (result: BatchItemResult) => {
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve(result);
      } else {
        results.push(result);
      }
    };

    const getNextResult = (): Promise<BatchItemResult | undefined> => {
      if (results.length > 0) {
        return Promise.resolve(results.shift());
      }
      if (itemsCompleted >= items.length) {
        return Promise.resolve(undefined);
      }
      return new Promise((resolve) => {
        resolveNext = resolve;
      });
    };

    // Start processing in background
    const processAll = async () => {
      const queue = [...items];
      const activePromises: Promise<void>[] = [];

      const processItem = async (item: BatchItem): Promise<BatchItemResult> => {
        const itemStart = Date.now();
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          if (signal?.aborted) {
            return {
              id: item.id,
              success: false,
              error: new Error('Batch processing aborted'),
              processingTime: Date.now() - itemStart,
              metadata: item.metadata,
            };
          }

          try {
            const result = await this.rlm.completion(item.query, item.context, item.options);
            return {
              id: item.id,
              success: true,
              result,
              processingTime: Date.now() - itemStart,
              metadata: item.metadata,
            };
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxRetries) {
              await this.delay(retryDelay * (attempt + 1));
            }
          }
        }

        return {
          id: item.id,
          success: false,
          error: lastError,
          processingTime: Date.now() - itemStart,
          metadata: item.metadata,
        };
      };

      const processNext = async (): Promise<void> => {
        while (queue.length > 0 && !signal?.aborted) {
          const item = queue.shift();
          if (!item) return;

          const result = await processItem(item);

          itemsCompleted++;
          processingTimes.push(result.processingTime);

          if (result.success) {
            succeeded++;
            if (result.result) {
              totalTokens += result.result.usage.totalTokens;
              totalCost += result.result.usage.estimatedCost;
            }
          } else {
            failed++;
            if (!continueOnError) {
              queue.length = 0;
            }
          }

          enqueueResult(result);
        }
      };

      for (let i = 0; i < Math.min(concurrency, items.length); i++) {
        activePromises.push(processNext());
      }

      await Promise.all(activePromises);
      // Signal completion
      enqueueResult(undefined as unknown as BatchItemResult);
    };

    // Start processing
    processAll();

    // Yield results as they complete
    while (true) {
      const result = await getNextResult();
      if (!result) break;
      yield result;
    }

    // Return summary
    return {
      total: items.length,
      succeeded,
      failed,
      totalTime: Date.now() - startTime,
      averageTime: (Date.now() - startTime) / items.length,
      totalTokens,
      totalCost,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create batch items from arrays of queries and contexts.
 */
export function createBatchItems(
  queries: string[],
  contexts?: string[],
  options?: RLMCompletionOptions
): BatchItem[] {
  return queries.map((query, index) => ({
    id: `item-${index}`,
    query,
    context: contexts?.[index],
    options,
  }));
}

/**
 * Map a function over items in batches.
 *
 * @example
 * ```typescript
 * const results = await mapBatch(
 *   documents,
 *   async (doc) => rlm.completion('Summarize this', doc),
 *   { concurrency: 3 }
 * );
 * ```
 */
export async function mapBatch<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { concurrency?: number; signal?: AbortSignal } = {}
): Promise<R[]> {
  const { concurrency = 3, signal } = options;
  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  const processNext = async (): Promise<void> => {
    while (queue.length > 0) {
      if (signal?.aborted) {
        throw new Error('Batch processing aborted');
      }

      const entry = queue.shift();
      if (!entry) return;

      results[entry.index] = await fn(entry.item, entry.index);
    }
  };

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
  return results;
}
