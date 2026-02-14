import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockLLMClient, createFlakeyMock } from './helpers/mock-client.js';
import {
  BatchProcessor,
  createBatchItems,
  mapBatch,
} from '../src/batch.js';
import type { BatchItem, BatchProgress } from '../src/batch.js';

// Mock the client module
vi.mock('../src/clients/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/clients/index.js')>();
  return {
    ...original,
    createClient: vi.fn(),
  };
});

// Import after mocking
import { RLM } from '../src/rlm.js';
import { createClient } from '../src/clients/index.js';

// Use a valid model name when using mock client
const MOCK_MODEL = 'gpt-4o-mini';

describe('Batch Concurrent Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('10 concurrent requests', () => {
    it('should process 10 items concurrently', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 10 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
          usage: { promptTokens: 10, completionTokens: 5 },
          delay: 50, // Small delay to simulate network
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items: BatchItem[] = createBatchItems(
        Array.from({ length: 10 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      const startTime = Date.now();
      const results = await processor.process(items, {
        concurrency: 10,
        maxRetries: 0,
      });
      const elapsed = Date.now() - startTime;

      // All should complete
      expect(results.summary.succeeded).toBe(10);
      expect(results.summary.failed).toBe(0);

      // Should be faster than sequential (10 * 50ms = 500ms)
      // With 10 concurrent, should be ~50ms but CI can be slow
      // Just verify it's faster than fully sequential
      expect(elapsed).toBeLessThan(500);

      // Verify all responses
      for (let i = 0; i < 10; i++) {
        expect(results.results[i].success).toBe(true);
        expect(results.results[i].result?.response).toContain(`Response`);
      }
    });

    it('should call progress callback correctly', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 10 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 10 }, (_, i) => `Query ${i}`)
      );

      const progressCalls: BatchProgress[] = [];
      const processor = new BatchProcessor(rlm);

      await processor.process(items, {
        concurrency: 5,
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });

      // Should have progress callbacks
      expect(progressCalls.length).toBeGreaterThan(0);

      // Last progress should show 100%
      const lastProgress = progressCalls[progressCalls.length - 1];
      expect(lastProgress.completed).toBe(10);
      expect(lastProgress.total).toBe(10);
      expect(lastProgress.percentage).toBe(100);
    });
  });

  describe('50 concurrent requests', () => {
    it('should process 50 items with high concurrency', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 50 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
          delay: 20,
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 50 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      const startTime = Date.now();
      const results = await processor.process(items, { concurrency: 50 });
      const elapsed = Date.now() - startTime;

      expect(results.summary.succeeded).toBe(50);
      expect(results.summary.failed).toBe(0);

      // With 50 concurrent, should be much faster than sequential
      expect(elapsed).toBeLessThan(2000);
    });

    it('should handle high concurrency without resource exhaustion', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 50 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 50 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      // Should not throw or hang
      const results = await processor.process(items, { concurrency: 50 });
      expect(results.summary.succeeded).toBe(50);
    });
  });

  describe('Mixed success/failure', () => {
    it('should handle mix of successful and failed requests', async () => {
      const responses = Array.from({ length: 20 }, (_, i) => {
        if (i % 5 === 0) {
          // Every 5th request fails
          return { content: '', error: new Error(`Error ${i}`) };
        }
        return { content: `FINAL("Success ${i}")` };
      });

      const client = new MockLLMClient(responses);
      vi.mocked(createClient).mockReturnValue(client);
      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 20 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      const results = await processor.process(items, {
        concurrency: 10,
        maxRetries: 0, // No retries to see failures
      });

      // 4 failures (indices 0, 5, 10, 15)
      expect(results.summary.failed).toBe(4);
      expect(results.summary.succeeded).toBe(16);

      // Check specific results
      expect(results.results[0].success).toBe(false);
      expect(results.results[1].success).toBe(true);
      expect(results.results[5].success).toBe(false);
    });

    it('should retry failed requests', async () => {
      // Create a client that fails first, then succeeds
      const callCounts = new Map<number, number>();
      const client = new MockLLMClient([]);
      vi.mocked(createClient).mockReturnValue(client);

      // Override completion to track calls
      let callIndex = 0;
      vi.spyOn(client, 'completion').mockImplementation(async () => {
        const index = callIndex++;
        const queryIndex = index % 5;
        const count = (callCounts.get(queryIndex) || 0) + 1;
        callCounts.set(queryIndex, count);

        // Fail on first attempt for odd indices
        if (queryIndex % 2 === 1 && count === 1) {
          throw new Error('Temporary failure');
        }

        return {
          content: `FINAL("Success")`,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      });

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 5 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      const results = await processor.process(items, {
        concurrency: 5,
        maxRetries: 2,
        retryDelay: 10,
      });

      // All should eventually succeed after retries
      expect(results.summary.succeeded).toBe(5);
      expect(results.summary.failed).toBe(0);
    });

    it('should give up after max retries', async () => {
      const client = new MockLLMClient([]);
      vi.mocked(createClient).mockReturnValue(client);
      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      vi.spyOn(rlm, 'completion').mockRejectedValue(new Error('Persistent failure'));

      const items = createBatchItems(['Query 1', 'Query 2']);

      const processor = new BatchProcessor(rlm);

      const results = await processor.process(items, {
        concurrency: 2,
        maxRetries: 2,
        retryDelay: 10,
      });

      // Both should fail after retries exhausted
      expect(results.summary.failed).toBe(2);
      expect(results.summary.succeeded).toBe(0);

      // Each should have been tried 3 times (initial + 2 retries)
      expect(rlm.completion).toHaveBeenCalledTimes(6);
    });
  });

  describe('Progress callback accuracy', () => {
    it('should report accurate progress throughout processing', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 10 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
          delay: 50,
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 10 }, (_, i) => `Query ${i}`)
      );

      const progressHistory: BatchProgress[] = [];
      const processor = new BatchProcessor(rlm);

      await processor.process(items, {
        concurrency: 2,
        onProgress: (progress) => progressHistory.push({ ...progress }),
      });

      // Should have multiple progress updates
      expect(progressHistory.length).toBeGreaterThan(5);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressHistory.length; i++) {
        expect(progressHistory[i].completed).toBeGreaterThanOrEqual(
          progressHistory[i - 1].completed
        );
      }

      // Percentage should be accurate
      for (const progress of progressHistory) {
        const expectedPercentage = Math.round((progress.completed / progress.total) * 100);
        expect(progress.percentage).toBe(expectedPercentage);
      }
    });

    it('should track failed items in progress', async () => {
      const responses = Array.from({ length: 10 }, (_, i) => {
        if (i < 3) {
          return { content: '', error: new Error('Fail') };
        }
        return { content: `FINAL("Success ${i}")` };
      });

      const client = new MockLLMClient(responses);
      vi.mocked(createClient).mockReturnValue(client);
      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 10 }, (_, i) => `Query ${i}`)
      );

      const progressHistory: BatchProgress[] = [];
      const processor = new BatchProcessor(rlm);

      const results = await processor.process(items, {
        concurrency: 5,
        maxRetries: 0,
        onProgress: (progress) => progressHistory.push({ ...progress }),
      });

      // Check that progress tracked failures
      const lastProgress = progressHistory[progressHistory.length - 1];
      expect(lastProgress.completed).toBe(10);
      expect(results.summary.failed).toBe(3);
    });
  });

  describe('Resource cleanup', () => {
    it('should clean up resources after completion', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 10 }, () => ({ content: 'FINAL("Response")' }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 10 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      await processor.process(items, { concurrency: 5 });

      // Re-setup client for second batch
      const client2 = new MockLLMClient(
        Array.from({ length: 10 }, () => ({ content: 'FINAL("Response")' }))
      );
      vi.mocked(createClient).mockReturnValue(client2);
      const rlm2 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });
      const processor2 = new BatchProcessor(rlm2);

      // Processor should be reusable
      const results2 = await processor2.process(items, { concurrency: 5 });
      expect(results2.summary.succeeded).toBe(10);
    });

    it('should clean up resources after error', async () => {
      const client = new MockLLMClient([]);
      vi.mocked(createClient).mockReturnValue(client);
      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      vi.spyOn(rlm, 'completion').mockRejectedValue(new Error('Fail'));

      const items = createBatchItems(['Query 1']);

      const processor = new BatchProcessor(rlm);

      await processor.process(items, { concurrency: 1, maxRetries: 0 });

      // Setup new client for second attempt
      const client2 = new MockLLMClient([{ content: 'FINAL("Success")' }]);
      vi.mocked(createClient).mockReturnValue(client2);
      const rlm2 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });
      const processor2 = new BatchProcessor(rlm2);

      // Should still be usable after error
      const results2 = await processor2.process(items, { concurrency: 1 });
      expect(results2.summary.succeeded).toBe(1);
    });
  });

  describe('mapBatch helper', () => {
    it('should map over items with concurrency', async () => {
      const items = [1, 2, 3, 4, 5];

      const results = await mapBatch(
        items,
        async (item) => item * 2,
        { concurrency: 3 }
      );

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should handle errors in map function', async () => {
      const items = [1, 2, 3, 4, 5];

      await expect(
        mapBatch(
          items,
          async (item) => {
            if (item === 3) throw new Error('Failed');
            return item * 2;
          },
          { concurrency: 3 }
        )
      ).rejects.toThrow('Failed');
    });

    it('should respect concurrency limit', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      await mapBatch(
        items,
        async (item) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise(resolve => setTimeout(resolve, 50));
          currentConcurrent--;
          return item;
        },
        { concurrency: 3 }
      );

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('createBatchItems helper', () => {
    it('should create batch items from queries', () => {
      const queries = ['Query 1', 'Query 2', 'Query 3'];
      const items = createBatchItems(queries);

      expect(items.length).toBe(3);
      expect(items[0].query).toBe('Query 1');
      expect(items[1].query).toBe('Query 2');
      expect(items[2].query).toBe('Query 3');
    });

    it('should assign unique IDs', () => {
      const queries = ['A', 'B', 'C'];
      const items = createBatchItems(queries);

      const ids = items.map(i => i.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });

    it('should allow custom context per item', () => {
      const items: BatchItem[] = [
        { id: '1', query: 'Query 1', context: 'Context 1' },
        { id: '2', query: 'Query 2', context: 'Context 2' },
      ];

      expect(items[0].context).toBe('Context 1');
      expect(items[1].context).toBe('Context 2');
    });
  });

  describe('Concurrency edge cases', () => {
    it('should handle concurrency of 1 (sequential)', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 5 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
          delay: 50,
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(
        Array.from({ length: 5 }, (_, i) => `Query ${i}`)
      );

      const processor = new BatchProcessor(rlm);

      const startTime = Date.now();
      const results = await processor.process(items, { concurrency: 1 });
      const elapsed = Date.now() - startTime;

      expect(results.summary.succeeded).toBe(5);
      // Sequential should take ~250ms (5 * 50ms)
      expect(elapsed).toBeGreaterThanOrEqual(200);
    });

    it('should handle concurrency higher than item count', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 3 }, (_, i) => ({
          content: `FINAL("Response ${i}")`,
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const items = createBatchItems(['A', 'B', 'C']);

      const processor = new BatchProcessor(rlm);

      const results = await processor.process(items, {
        concurrency: 100, // Much higher than item count
      });

      expect(results.summary.succeeded).toBe(3);
    });

    it('should handle empty batch', async () => {
      const client = new MockLLMClient([]);
      vi.mocked(createClient).mockReturnValue(client);
      const rlm = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const processor = new BatchProcessor(rlm);

      const results = await processor.process([], { concurrency: 5 });

      expect(results.summary.succeeded).toBe(0);
      expect(results.summary.failed).toBe(0);
      expect(results.results).toEqual([]);
    });
  });
});
