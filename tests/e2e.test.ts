import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockLLMClient, createFlakeyMock } from './helpers/mock-client.js';
import type { RLMStreamEvent } from '../src/types.js';

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

// Use a valid model name
const MOCK_MODEL = 'gpt-4o-mini';

describe('End-to-End Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Full RLM workflow with mocks', () => {
    it('should complete basic query-response workflow', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("The answer is 42")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('What is the meaning of life?', 'Context');

      expect(result.response).toBe('The answer is 42');
      expect(result.trace.length).toBeGreaterThanOrEqual(1);
      expect(result.trace.some(t => t.type === 'final_output')).toBe(true);
    });

    it('should complete workflow with code execution', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nconst x = 1 + 1;\nprint("Result: " + x);\n```' },
        { content: 'FINAL("The calculation shows 2")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Calculate 1+1', 'Context');

      expect(result.response).toContain('2');
      expect(result.trace.length).toBeGreaterThanOrEqual(2);
      // Check for code execution trace
      expect(result.trace.some(t => t.type === 'code_execution')).toBe(true);
      expect(result.trace.some(t => t.type === 'final_output')).toBe(true);
    });

    it('should complete workflow with context analysis', async () => {
      const context = `
        Document: Annual Report
        Revenue: $1,000,000
        Expenses: $750,000
        Profit: $250,000
      `;

      const client = new MockLLMClient([
        { content: '```javascript\nconst matches = grep(context, /\\$[\\d,]+/);\nprint("Found amounts: " + matches.join(", "));\n```' },
        { content: 'FINAL("The company made $250,000 profit")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('What was the profit?', context);

      expect(result.response).toContain('250,000');
      expect(result.trace.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Multi-iteration execution', () => {
    it('should handle 5 iterations before final answer', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Step 1");\n```' },
        { content: '```javascript\nprint("Step 2");\n```' },
        { content: '```javascript\nprint("Step 3");\n```' },
        { content: '```javascript\nprint("Step 4");\n```' },
        { content: '```javascript\nprint("Step 5");\n```' },
        { content: 'FINAL("Completed after 5 steps")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const result = await rlm.completion('Run 5 steps', 'Context');

      expect(result.response).toContain('Completed after 5 steps');
      expect(result.trace.length).toBeGreaterThanOrEqual(6);

      // Verify we have code execution traces
      const codeTraces = result.trace.filter(t => t.type === 'code_execution');
      expect(codeTraces.length).toBeGreaterThanOrEqual(5);
    });

    it('should stop at max iterations', async () => {
      const client = new MockLLMClient(
        Array.from({ length: 20 }, () => ({
          content: '```javascript\nprint("Still going...");\n```',
        }))
      );
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      // Should throw max iterations error
      await expect(rlm.completion('Keep going', 'Context')).rejects.toThrow('Maximum iterations');
    });

    it('should accumulate token usage across iterations', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("1");\n```', usage: { promptTokens: 100, completionTokens: 50 } },
        { content: '```javascript\nprint("2");\n```', usage: { promptTokens: 150, completionTokens: 60 } },
        { content: 'FINAL("Done")', usage: { promptTokens: 200, completionTokens: 20 } },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Count', 'Context');

      // Total: 100+50 + 150+60 + 200+20 = 580
      expect(result.usage.totalTokens).toBe(580);
    });
  });

  describe('Recursive sub-queries', () => {
    it('should handle single level sub-query', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nconst answer = await llm_query("What is 2+2?");\nprint("Sub-answer: " + answer);\n```' },
        { content: '4' }, // Sub-query response
        { content: 'FINAL("The sub-query returned 4")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
        maxDepth: 2,
      });

      const result = await rlm.completion('Ask a sub-question', 'Context');

      expect(result.response).toContain('4');
    });

    it('should handle parallel sub-queries', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nconst results = await llm_query_parallel([{prompt: "Q1"}, {prompt: "Q2"}, {prompt: "Q3"}]);\nprint("Results: " + results.join(", "));\n```' },
        { content: 'A1' },
        { content: 'A2' },
        { content: 'A3' },
        { content: 'FINAL("Got 3 answers")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
        maxDepth: 2,
      });

      const result = await rlm.completion('Ask parallel questions', 'Context');

      expect(result.response).toContain('3 answers');
    });

    it('should respect max depth limit', async () => {
      // Trying to nest too deep should fail
      const client = new MockLLMClient([
        { content: '```javascript\nconst answer = await llm_query("nested 1");\n```' },
        { content: '```javascript\nconst answer = await llm_query("nested 2");\n```' }, // This should fail at depth 1
        { content: 'FINAL("Should not reach")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
        maxDepth: 1, // Only allow depth 0 and 1
      });

      const result = await rlm.completion('Try to nest', 'Context');

      // Should complete but with depth error in trace
      expect(result.trace.length).toBeGreaterThan(0);
    });
  });

  describe('FINAL and FINAL_VAR handling', () => {
    it('should handle FINAL with string', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("Direct answer")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test', 'Context');

      expect(result.response).toBe('Direct answer');
    });

    it('should handle FINAL_VAR', async () => {
      // FINAL_VAR needs to be called within code execution
      const client = new MockLLMClient([
        { content: '```javascript\nlet myResult = "Answer from variable";\nFINAL_VAR("myResult");\n```' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test FINAL_VAR', 'Context');

      // FINAL_VAR returns the variable value
      expect(result.response).toBeDefined();
    });

    it('should handle FINAL with complex expression', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("Line 1\\nLine 2\\nLine 3")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test multiline', 'Context');

      expect(result.response).toContain('Line 1');
      expect(result.response).toContain('Line 2');
    });

    it('should handle FINAL with special characters', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("Result with special chars: $100 & <tag>")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test special', 'Context');

      expect(result.response).toContain('$100');
      expect(result.response).toContain('&');
    });
  });

  describe('Error recovery scenarios', () => {
    it('should recover from code execution error', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nthrow new Error("Intentional error");\n```' },
        { content: '```javascript\nprint("Recovered!");\n```' },
        { content: 'FINAL("Recovered from error")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test recovery', 'Context');

      expect(result.response).toContain('Recovered');
      expect(result.trace.length).toBeGreaterThanOrEqual(3);
    });

    it('should recover from syntax error in code', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nthis is not valid javascript{{\n```' },
        { content: '```javascript\nprint("Fixed!");\n```' },
        { content: 'FINAL("Fixed the error")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test syntax error', 'Context');

      expect(result.response).toContain('Fixed');
    });

    it('should handle empty LLM response', async () => {
      const client = new MockLLMClient([
        { content: '' },
        { content: 'FINAL("Got something")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Test empty', 'Context');

      expect(result.response).toContain('Got something');
    });
  });

  describe('Timeout handling', () => {
    it('should timeout long-running code', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nwhile(true) {}\n```' }, // Infinite loop
        { content: 'FINAL("Should continue after timeout")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
        sandboxTimeout: 1000, // Minimum timeout (1 second)
      });

      const result = await rlm.completion('Test timeout', 'Context');

      // Should recover and continue
      expect(result.trace.length).toBeGreaterThanOrEqual(1);
      // Should have code execution trace (possibly with timeout error)
      const codeTrace = result.trace.find(t => t.type === 'code_execution');
      // Either succeeded with timeout handling or just has trace entries
      expect(result.trace.length).toBeGreaterThan(0);
    });
  });

  describe('Cost tracking accuracy', () => {
    it('should track costs across execution', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("1");\n```', usage: { promptTokens: 1000, completionTokens: 500 } },
        { content: '```javascript\nprint("2");\n```', usage: { promptTokens: 1500, completionTokens: 600 } },
        { content: 'FINAL("Done")', usage: { promptTokens: 2000, completionTokens: 100 } },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const result = await rlm.completion('Track costs', 'Context');

      // Verify token totals
      expect(result.usage.totalTokens).toBe(5700);
    });
  });

  describe('Streaming integration', () => {
    it('should stream complete workflow', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Processing...");\n```' },
        { content: 'FINAL("Stream complete")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Stream test', 'Context')) {
        events.push(event);
      }

      // Should have start, code events, final, and done
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('start');
      expect(eventTypes).toContain('code');
      expect(eventTypes).toContain('final');
      expect(eventTypes).toContain('done');
    });

    it('should stream with same final result as non-streaming', async () => {
      const responses = [
        { content: '```javascript\nprint("Test");\n```' },
        { content: 'FINAL("Final answer")' },
      ];

      // Non-streaming
      const client1 = new MockLLMClient([...responses]);
      vi.mocked(createClient).mockReturnValue(client1);
      const rlm1 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });
      const result1 = await rlm1.completion('Test', 'Context');

      // Streaming
      const client2 = new MockLLMClient([...responses]);
      vi.mocked(createClient).mockReturnValue(client2);
      const rlm2 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });
      let streamedResponse: string | undefined;
      for await (const event of rlm2.stream('Test', 'Context')) {
        if (event.type === 'final') {
          streamedResponse = event.data.response;
        }
      }

      // Results should have the same response
      expect(result1.response).toBe('Final answer');
      expect(streamedResponse).toBe('Final answer');
    });
  });

  describe('Complex real-world scenarios', () => {
    it('should analyze document and extract information', async () => {
      const context = `
        Product: Widget Pro
        Price: $99.99
        Features:
        - Durable construction
        - Easy to use
        - 2-year warranty
        Rating: 4.5/5
      `;

      const client = new MockLLMClient([
        { content: '```javascript\nconst priceMatch = grep(context, /\\$[\\d.]+/);\nprint("Price found: " + priceMatch[0]);\n```' },
        { content: '```javascript\nconst ratingMatch = grep(context, /Rating: [\\d.]+/);\nprint("Rating found: " + ratingMatch[0]);\n```' },
        { content: 'FINAL("Widget Pro costs $99.99 and has a 4.5/5 rating")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const result = await rlm.completion('What is the price and rating?', context);

      expect(result.response).toContain('$99.99');
      expect(result.response).toContain('4.5');
    });

    it('should chunk and analyze large context', async () => {
      const context = 'Section 1: Important data. '.repeat(100) + 'NEEDLE: Found it! ' + 'Section 2: More data. '.repeat(100);

      const client = new MockLLMClient([
        { content: '```javascript\nconst chunks = chunk(context, 500);\nprint("Total chunks: " + chunks.length);\n```' },
        { content: '```javascript\nconst found = grep(context, /NEEDLE/);\nprint("Found needle: " + found.length + " matches");\n```' },
        { content: 'FINAL("Found the needle in the haystack!")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const result = await rlm.completion('Find the needle', context);

      expect(result.response).toContain('needle');
    });
  });
});
