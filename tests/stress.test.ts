import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockLLMClient } from './helpers/mock-client.js';
import { VMSandbox } from '../src/sandbox/vm-sandbox.js';
import { chunkText, truncateToTokens, getContextStats, estimateTokens } from '../src/utils/context.js';
import { estimateTokensForString } from '../src/utils/tokens.js';

// Mock the client module for RLM tests
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

describe('Stress Tests', () => {
  describe('Large Context Handling', () => {
    /**
     * Generate a large text context of approximately the given token count.
     * Uses average of 4 characters per token as heuristic.
     */
    function generateLargeContext(approximateTokens: number): string {
      const charsPerToken = 4;
      const targetChars = approximateTokens * charsPerToken;
      const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ';
      const paragraphLength = paragraph.length;
      const repetitions = Math.ceil(targetChars / paragraphLength);

      let text = '';
      for (let i = 0; i < repetitions; i++) {
        text += `[Section ${i + 1}] ${paragraph}\n`;
      }

      return text.slice(0, targetChars);
    }

    it('should handle 10K token context', () => {
      const context = generateLargeContext(10000);
      const stats = getContextStats(context);

      expect(stats.estimatedTokens).toBeGreaterThan(8000);
      expect(stats.estimatedTokens).toBeLessThan(15000);
      expect(stats.characters).toBeGreaterThan(30000);
    });

    it('should handle 50K token context', () => {
      const context = generateLargeContext(50000);
      const stats = getContextStats(context);

      expect(stats.estimatedTokens).toBeGreaterThan(40000);
      expect(stats.estimatedTokens).toBeLessThan(70000);
      expect(stats.lines).toBeGreaterThan(100);
    });

    it('should handle 100K token context', () => {
      const context = generateLargeContext(100000);
      const stats = getContextStats(context);

      expect(stats.estimatedTokens).toBeGreaterThan(80000);
      expect(stats.estimatedTokens).toBeLessThan(140000);
    });

    it('should chunk 100K context efficiently', () => {
      const context = generateLargeContext(100000);
      const startTime = Date.now();

      const chunks = chunkText(context, 4000);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
      expect(chunks.length).toBeGreaterThan(10);
      expect(chunks.length).toBeLessThan(150); // Allow for some variation

      // Verify chunks are reasonable size
      for (const chunk of chunks) {
        const tokens = estimateTokensForString(chunk);
        expect(tokens).toBeLessThanOrEqual(6000); // Allow some margin for chunk boundaries
      }
    });

    it('should truncate large context to token limit', () => {
      const context = generateLargeContext(100000);
      const truncated = truncateToTokens(context, 10000);

      const truncatedTokens = estimateTokensForString(truncated);
      expect(truncatedTokens).toBeLessThanOrEqual(10500); // Allow small margin
      expect(truncatedTokens).toBeGreaterThan(8000);
    });
  });

  describe('Memory Efficiency', () => {
    function generateLargeContext(approximateTokens: number): string {
      const charsPerToken = 4;
      const targetChars = approximateTokens * charsPerToken;
      const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
      return paragraph.repeat(Math.ceil(targetChars / paragraph.length)).slice(0, targetChars);
    }

    it('should not leak memory during multiple chunking operations', () => {
      const context = generateLargeContext(50000);
      const iterations = 10;

      // Take initial measurement (rough approximation)
      if (typeof global.gc === 'function') {
        global.gc();
      }
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        const chunks = chunkText(context, 2000);
        // Access chunks to prevent optimization
        expect(chunks.length).toBeGreaterThan(0);
      }

      if (typeof global.gc === 'function') {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;

      // Memory should not grow significantly (allow 50MB margin)
      const memoryGrowth = finalMemory - initialMemory;
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle repeated context stats calculations', () => {
      const context = generateLargeContext(50000);
      const iterations = 100;

      const startTime = Date.now();
      for (let i = 0; i < iterations; i++) {
        const stats = getContextStats(context);
        expect(stats.estimatedTokens).toBeGreaterThan(0);
      }
      const elapsed = Date.now() - startTime;

      // 100 iterations should complete in under 2 seconds
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('Sandbox Stress', () => {
    function generateLargeContext(approximateTokens: number): string {
      const charsPerToken = 4;
      const targetChars = approximateTokens * charsPerToken;
      const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
      return paragraph.repeat(Math.ceil(targetChars / paragraph.length)).slice(0, targetChars);
    }

    it('should handle large context in sandbox', async () => {
      const context = generateLargeContext(50000);
      const sandbox = new VMSandbox({
        context: context,
        onLLMQuery: async () => 'mock response',
        options: { timeout: 5000 },
      });

      const result = await sandbox.execute('print(context.length)');
      expect(result.output).toContain(context.length.toString());

      sandbox.dispose();
    });

    it('should handle multiple sequential executions', async () => {
      const context = generateLargeContext(10000);
      const sandbox = new VMSandbox({
        context: context,
        onLLMQuery: async () => 'mock response',
        options: { timeout: 5000 },
      });

      const iterations = 50;
      for (let i = 0; i < iterations; i++) {
        const result = await sandbox.execute(`print(${i} + 1)`);
        expect(result.output).toContain(String(i + 1));
      }

      sandbox.dispose();
    });

    it('should handle complex operations on large context', async () => {
      const context = generateLargeContext(25000);
      const sandbox = new VMSandbox({
        context: context,
        onLLMQuery: async () => 'mock response',
        options: { timeout: 10000 },
      });

      // Test chunking
      const chunkResult = await sandbox.execute('print(chunk(context, 1000).length)');
      expect(parseInt(chunkResult.output)).toBeGreaterThan(10);

      // Test grep - returns matching lines (context may be single line)
      const grepResult = await sandbox.execute('print(grep(context, /ipsum/).length)');
      expect(parseInt(grepResult.output)).toBeGreaterThanOrEqual(1);

      // Test len
      const lenResult = await sandbox.execute('print(len(context))');
      expect(parseInt(lenResult.output)).toBeGreaterThan(80000);

      sandbox.dispose();
    });

    it('should recover from timeout gracefully', async () => {
      const sandbox = new VMSandbox({
        context: 'test context',
        onLLMQuery: async () => 'mock response',
        options: { timeout: 1000 }, // Minimum timeout
      });

      // This should timeout
      const result = await sandbox.execute(`
        let count = 0;
        while (true) { count++; }
        count
      `);

      expect(result.error).toBeDefined();
      expect(result.error?.toLowerCase()).toContain('timed out');

      // Sandbox should still be usable after timeout
      const simpleResult = await sandbox.execute('print(1 + 1)');
      expect(simpleResult.output).toContain('2');

      sandbox.dispose();
    });
  });

  describe('RLM Stress (integration)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    function generateLargeContext(approximateTokens: number): string {
      const charsPerToken = 4;
      const targetChars = approximateTokens * charsPerToken;
      const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
      return paragraph.repeat(Math.ceil(targetChars / paragraph.length)).slice(0, targetChars);
    }

    it('should handle execution with large context using RLM', async () => {
      const context = generateLargeContext(20000);

      const mockClient = new MockLLMClient([
        {
          content: '```javascript\nprint("Context length: " + len(context));\nFINAL("Done processing")\n```',
          usage: { promptTokens: 5000, completionTokens: 50 },
        },
      ]);
      vi.mocked(createClient).mockReturnValue(mockClient);

      // Use RLM which handles provider detection internally
      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
        sandboxTimeout: 5000,
      });

      const result = await rlm.completion('Process this context', context);

      expect(result.response).toContain('Done processing');
      expect(result.trace.length).toBeGreaterThan(0);
    });

    it('should handle multiple iterations with context operations', async () => {
      const context = generateLargeContext(10000);

      const mockClient = new MockLLMClient([
        {
          content: '```javascript\nconst chunks = chunk(context, 1000);\nprint("Chunks: " + chunks.length);\n```',
          usage: { promptTokens: 3000, completionTokens: 30 },
        },
        {
          content: '```javascript\nconst matches = grep(context, /ipsum/);\nprint("Matches: " + matches.length);\n```',
          usage: { promptTokens: 3000, completionTokens: 30 },
        },
        {
          content: 'FINAL("Analysis complete")',
          usage: { promptTokens: 3000, completionTokens: 10 },
        },
      ]);
      vi.mocked(createClient).mockReturnValue(mockClient);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
        sandboxTimeout: 5000,
      });

      const result = await rlm.completion('Analyze this text', context);

      expect(result.response).toContain('Analysis complete');
      expect(result.trace.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Token Estimation Performance', () => {
    function generateLargeContext(approximateTokens: number): string {
      const charsPerToken = 4;
      const targetChars = approximateTokens * charsPerToken;
      const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
      return paragraph.repeat(Math.ceil(targetChars / paragraph.length)).slice(0, targetChars);
    }

    it('should estimate tokens quickly for large texts', () => {
      const context = generateLargeContext(100000);

      const startTime = Date.now();
      const estimate = estimateTokens(context);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
      expect(estimate).toBeGreaterThan(80000);
      expect(estimate).toBeLessThan(150000);
    });

    it('should handle repeated estimations efficiently', () => {
      const texts = Array.from({ length: 100 }, (_, i) =>
        generateLargeContext(1000 + i * 100)
      );

      const startTime = Date.now();
      for (const text of texts) {
        const estimate = estimateTokens(text);
        expect(estimate).toBeGreaterThan(0);
      }
      const elapsed = Date.now() - startTime;

      // 100 estimations should complete in under 500ms
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Concurrent Operations', () => {
    function generateLargeContext(approximateTokens: number): string {
      const charsPerToken = 4;
      const targetChars = approximateTokens * charsPerToken;
      const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
      return paragraph.repeat(Math.ceil(targetChars / paragraph.length)).slice(0, targetChars);
    }

    it('should handle concurrent chunking operations', async () => {
      const contexts = Array.from({ length: 10 }, () =>
        generateLargeContext(10000)
      );

      const startTime = Date.now();
      const results = await Promise.all(
        contexts.map(async (context) => {
          return chunkText(context, 2000);
        })
      );
      const elapsed = Date.now() - startTime;

      // All 10 concurrent operations should complete in under 2 seconds
      expect(elapsed).toBeLessThan(2000);

      for (const chunks of results) {
        expect(chunks.length).toBeGreaterThan(3);
      }
    });

    it('should handle concurrent sandbox executions', async () => {
      const sandboxes = Array.from({ length: 5 }, (_, i) =>
        new VMSandbox({
          context: `Context ${i}`,
          onLLMQuery: async () => 'mock response',
          options: { timeout: 5000 },
        })
      );

      // Execute concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        sandboxes.map((sandbox, i) =>
          sandbox.execute(`print("Result " + ${i})`)
        )
      );
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1000);

      for (let i = 0; i < results.length; i++) {
        expect(results[i].output).toContain(`Result ${i}`);
      }

      // Cleanup
      sandboxes.forEach((s) => s.dispose());
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context', () => {
      const stats = getContextStats('');
      expect(stats.estimatedTokens).toBe(0);
      expect(stats.characters).toBe(0);
      expect(stats.lines).toBe(1); // Empty string has 1 line (no newlines)
    });

    it('should handle context with only whitespace', () => {
      const context = '   \n\n\t\t   \n   ';
      const stats = getContextStats(context);
      expect(stats.characters).toBeGreaterThan(0);
      // Paragraphs filter empty strings, so whitespace-only content has 0 paragraphs
      expect(stats.paragraphs).toBe(0);
    });

    it('should handle context with special characters', () => {
      const context = '🎉 こんにちは 안녕하세요 مرحبا 🚀'.repeat(1000);
      const stats = getContextStats(context);
      expect(stats.estimatedTokens).toBeGreaterThan(0);
    });

    it('should handle very long single line', () => {
      const context = 'a'.repeat(1000000); // 1 million characters
      const stats = getContextStats(context);
      expect(stats.lines).toBe(1);
      expect(stats.estimatedTokens).toBeGreaterThan(100000);
    });

    it('should handle many short lines', () => {
      const context = 'a\n'.repeat(100000); // 100k lines
      const stats = getContextStats(context);
      expect(stats.lines).toBe(100001); // 100000 newlines = 100001 lines
    });
  });
});
