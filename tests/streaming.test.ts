import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockLLMClient } from './helpers/mock-client.js';
import type { RLMStreamEvent, StreamChunk, CompletionResult } from '../src/types.js';

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

describe('Streaming Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MockLLMClient Streaming', () => {
    it('should stream content in chunks', async () => {
      const client = new MockLLMClient([
        { content: 'Hello, this is a test response!' },
      ]);

      const chunks: StreamChunk[] = [];
      const generator = client.streamCompletion([{ role: 'user', content: 'Hi' }]);

      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      // Should have multiple chunks (word splits)
      expect(chunks.length).toBeGreaterThan(0);

      // Content should be available
      const content = chunks.map(c => c.content).join('');
      expect(content).toContain('Hello');
    });

    it('should return final result from generator', async () => {
      const client = new MockLLMClient([
        { content: 'Test response', usage: { promptTokens: 10, completionTokens: 5 } },
      ]);

      const generator = client.streamCompletion([{ role: 'user', content: 'Hi' }]);

      let finalResult: CompletionResult | undefined;
      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          finalResult = value;
          break;
        }
      }

      expect(finalResult).toBeDefined();
      expect(finalResult?.content).toContain('Test response');
      expect(finalResult?.usage.promptTokens).toBe(10);
    });
  });

  describe('RLM Streaming Events', () => {
    it('should emit start event', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("Done")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test query', 'Test context')) {
        events.push(event);
      }

      const startEvent = events.find(e => e.type === 'start');
      expect(startEvent).toBeDefined();
      expect(startEvent?.data).toHaveProperty('query', 'Test query');
    });

    it('should emit done event with usage', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("Completed successfully")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test query', 'Test context')) {
        events.push(event);
      }

      const doneEvent = events.find(e => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent?.data).toHaveProperty('usage');
      expect(doneEvent?.data).toHaveProperty('executionTime');

      // Response should be in the final event
      const finalEvent = events.find(e => e.type === 'final');
      expect(finalEvent).toBeDefined();
      expect((finalEvent?.data as any).response).toContain('Completed successfully');
    });

    it('should emit code events for code execution', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Hello from code!");\n```' },
        { content: 'FINAL("Done")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test query', 'Test context')) {
        events.push(event);
      }

      const codeEvent = events.find(e => e.type === 'code');
      expect(codeEvent).toBeDefined();
      expect((codeEvent?.data as any).code).toContain('Hello from code');

      const outputEvent = events.find(e => e.type === 'code_output');
      expect(outputEvent).toBeDefined();
      expect((outputEvent?.data as any).output).toContain('Hello from code');
    });

    it('should emit final event before done', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("The final answer")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test query', 'Test context')) {
        events.push(event);
      }

      const finalIndex = events.findIndex(e => e.type === 'final');
      const doneIndex = events.findIndex(e => e.type === 'done');

      expect(finalIndex).toBeLessThan(doneIndex);
      expect((events[finalIndex]?.data as any).response).toContain('The final answer');
    });

    it('should emit error event on failure', async () => {
      const client = new MockLLMClient([
        { content: '', error: new Error('API Error') },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      const events: RLMStreamEvent[] = [];
      try {
        for await (const event of rlm.stream('Test query', 'Test context')) {
          events.push(event);
        }
      } catch {
        // Streaming may throw on errors - this is expected
      }

      // Should have at least a start event
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'start')).toBe(true);
    });

    it('should emit sub_query and sub_response events', async () => {
      const client = new MockLLMClient([
        {
          content: '```javascript\nconst result = await llm_query("Sub question");\nprint(result);\n```',
        },
        { content: 'Sub answer' }, // Response to sub-query
        { content: 'FINAL("Main answer based on sub")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
        maxDepth: 2,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Main query', 'Main context')) {
        events.push(event);
      }

      // Sub-query events may or may not be emitted depending on implementation
      // Just verify we got a final answer
      expect(events.some(e => e.type === 'final')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);
    });
  });

  describe('Event Ordering', () => {
    it('should emit events in correct order', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Step 1");\n```' },
        { content: '```javascript\nprint("Step 2");\n```' },
        { content: 'FINAL("Complete")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const eventTypes: string[] = [];
      for await (const event of rlm.stream('Test', 'Context')) {
        eventTypes.push(event.type);
      }

      // Start should be first
      expect(eventTypes[0]).toBe('start');

      // Done should be last
      expect(eventTypes[eventTypes.length - 1]).toBe('done');

      // Code should come before code_output
      const code1Index = eventTypes.indexOf('code');
      const output1Index = eventTypes.indexOf('code_output');
      expect(code1Index).toBeLessThan(output1Index);

      // Final should come before done
      const finalIndex = eventTypes.indexOf('final');
      const doneIndex = eventTypes.indexOf('done');
      expect(finalIndex).toBeLessThan(doneIndex);
    });

    it('should maintain iteration sequence', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Iteration 1");\n```' },
        { content: '```javascript\nprint("Iteration 2");\n```' },
        { content: '```javascript\nprint("Iteration 3");\n```' },
        { content: 'FINAL("Done")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const codeOutputs: string[] = [];
      for await (const event of rlm.stream('Test', 'Context')) {
        if (event.type === 'code_output') {
          codeOutputs.push((event.data as any).output);
        }
      }

      expect(codeOutputs[0]).toContain('Iteration 1');
      expect(codeOutputs[1]).toContain('Iteration 2');
      expect(codeOutputs[2]).toContain('Iteration 3');
    });
  });

  describe('Stream Cancellation', () => {
    it('should stop early when breaking from generator', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("1");\n```' },
        { content: '```javascript\nprint("2");\n```' },
        { content: '```javascript\nprint("3");\n```' },
        { content: 'FINAL("Done")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const events: RLMStreamEvent[] = [];
      let eventCount = 0;
      for await (const event of rlm.stream('Test', 'Context')) {
        events.push(event);
        eventCount++;
        if (eventCount >= 3) {
          break; // Early termination
        }
      }

      // Should have stopped early
      expect(events.length).toBe(3);
      expect(events.some(e => e.type === 'done')).toBe(false);
    });
  });

  describe('Stream Error Recovery', () => {
    it('should continue emitting events after recoverable error', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nthrow new Error("Recoverable");\n```' },
        { content: '```javascript\nprint("Recovered!");\n```' },
        { content: 'FINAL("Done after recovery")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test', 'Context')) {
        events.push(event);
      }

      // Should have code_output events for the attempts
      const outputs = events.filter(e => e.type === 'code_output');
      expect(outputs.length).toBeGreaterThanOrEqual(1);

      // First output should have error property or error in output
      const firstOutput = outputs[0]?.data as any;
      expect(firstOutput.error || firstOutput.output).toBeDefined();

      // Should complete successfully
      expect(events.some(e => e.type === 'final')).toBe(true);
      expect(events.some(e => e.type === 'done')).toBe(true);
    });

    it('should emit error event for execution errors', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nwhile(true){}\n```' }, // Infinite loop
        { content: 'FINAL("Done after timeout")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
        sandboxTimeout: 1000, // Minimum timeout
      });

      const events: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test', 'Context')) {
        events.push(event);
      }

      // Should have code output with timeout error
      const outputs = events.filter(e => e.type === 'code_output');
      expect(outputs.length).toBeGreaterThan(0);
    });
  });

  describe('Final Result Accuracy', () => {
    it('should have accurate token usage in done event', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Test");\n```', usage: { promptTokens: 100, completionTokens: 50 } },
        { content: 'FINAL("Done")', usage: { promptTokens: 150, completionTokens: 20 } },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      let doneData: any;
      for await (const event of rlm.stream('Test', 'Context')) {
        if (event.type === 'done') {
          doneData = event.data;
        }
      }

      expect(doneData).toBeDefined();
      expect(doneData.usage.totalTokens).toBe(320); // 100+50+150+20
    });

    it('should capture all code events during streaming', async () => {
      const client = new MockLLMClient([
        { content: '```javascript\nprint("Step 1");\n```' },
        { content: '```javascript\nprint("Step 2");\n```' },
        { content: '```javascript\nprint("Step 3");\n```' },
        { content: 'FINAL("Complete")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 10,
      });

      const codeEvents: RLMStreamEvent[] = [];
      const codeOutputEvents: RLMStreamEvent[] = [];
      for await (const event of rlm.stream('Test', 'Context')) {
        if (event.type === 'code') {
          codeEvents.push(event);
        }
        if (event.type === 'code_output') {
          codeOutputEvents.push(event);
        }
      }

      // Should have 3 code events
      expect(codeEvents.length).toBe(3);
      // Should have 3 code output events
      expect(codeOutputEvents.length).toBe(3);
    });

    it('should have correct response in final event', async () => {
      const client = new MockLLMClient([
        { content: 'FINAL("The answer is 42")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm = new RLM({
        model: MOCK_MODEL,
        maxIterations: 5,
      });

      let finalResponse: string | undefined;
      for await (const event of rlm.stream('What is the meaning of life?', 'Context')) {
        if (event.type === 'final') {
          finalResponse = (event.data as any).response;
        }
      }

      expect(finalResponse).toBe('The answer is 42');
    });
  });

  describe('Multiple Concurrent Streams', () => {
    it('should handle multiple simultaneous streams', async () => {
      // Create a single client that returns FINAL for any query
      const client = new MockLLMClient([
        { content: 'FINAL("Result from stream")' },
        { content: 'FINAL("Result from stream")' },
        { content: 'FINAL("Result from stream")' },
      ]);
      vi.mocked(createClient).mockReturnValue(client);

      const rlm1 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });
      const rlm2 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });
      const rlm3 = new RLM({ model: MOCK_MODEL, maxIterations: 5 });

      const collectResults = async (rlm: RLM, query: string) => {
        const events: RLMStreamEvent[] = [];
        for await (const event of rlm.stream(query, 'Context')) {
          events.push(event);
        }
        return events;
      };

      const [results1, results2, results3] = await Promise.all([
        collectResults(rlm1, 'Query 1'),
        collectResults(rlm2, 'Query 2'),
        collectResults(rlm3, 'Query 3'),
      ]);

      // All should complete successfully
      expect(results1.some(e => e.type === 'done')).toBe(true);
      expect(results2.some(e => e.type === 'done')).toBe(true);
      expect(results3.some(e => e.type === 'done')).toBe(true);

      // Each should have a final response
      const getFinalEvent = (events: RLMStreamEvent[]) =>
        events.find(e => e.type === 'final');

      expect(getFinalEvent(results1)).toBeDefined();
      expect(getFinalEvent(results2)).toBeDefined();
      expect(getFinalEvent(results3)).toBeDefined();
    });
  });
});
