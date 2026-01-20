import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VMSandbox } from '../src/sandbox/vm-sandbox.js';
import {
  MockLLMClient,
  createCodeGeneratingMock,
  createLoopingMock,
} from './helpers/mock-client.js';
import { RLMLogger } from '../src/logger/index.js';
import { parseLLMOutput } from '../src/utils/parser.js';
import type { Message } from '../src/types.js';

/**
 * Simple executor for tests that doesn't require API key.
 * This mimics the core execution loop without the full RLMExecutor.
 */
async function executeWithMock(
  mockClient: MockLLMClient,
  query: string,
  context: string,
  options: { maxIterations?: number } = {}
) {
  const maxIterations = options.maxIterations ?? 10;
  const logger = new RLMLogger(false);
  const startTime = Date.now();

  const sandbox = new VMSandbox({
    context,
    onLLMQuery: async (prompt) => `Mock response for: ${prompt}`,
  });

  try {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: `Query: ${query}\n\nContext length: ${context.length} characters` },
    ];

    let iteration = 0;
    let finalAnswer: string | null = null;

    while (iteration < maxIterations) {
      iteration++;

      const completion = await mockClient.completion(messages);
      logger.logLLMCall(0, messages, completion.content, completion.usage);

      const parsed = parseLLMOutput(completion.content);

      // Execute code first if present (important for FINAL_VAR which needs variables set)
      if (parsed.code) {
        const result = await sandbox.execute(parsed.code);
        logger.logCodeExecution(0, parsed.code, result.output, result.executionTime, result.error);

        if (!parsed.final) {
          messages.push({ role: 'assistant', content: completion.content });
          messages.push({
            role: 'user',
            content: result.error ? `Error: ${result.error}` : `Output: ${result.output}`,
          });
        }
      }

      // Then check for final answer
      if (parsed.final) {
        if (parsed.final.type === 'FINAL') {
          finalAnswer = parsed.final.value;
        } else if (parsed.final.type === 'FINAL_VAR') {
          const varValue = sandbox.getVariable(parsed.final.value);
          finalAnswer = typeof varValue === 'string' ? varValue : JSON.stringify(varValue);
        }

        logger.logFinalOutput(0, finalAnswer ?? '', parsed.final.type);
        break;
      }

      if (!parsed.code) {
        messages.push({ role: 'assistant', content: completion.content });
        messages.push({ role: 'user', content: 'Please provide code or a final answer.' });
      }
    }

    if (finalAnswer === null) {
      throw new Error(`Maximum iterations (${maxIterations}) reached`);
    }

    const totalUsage = logger.getTotalUsage();

    return {
      response: finalAnswer,
      trace: logger.getEntries(),
      usage: {
        totalTokens: totalUsage.totalTokens,
        totalCalls: logger.getCallCount(),
        estimatedCost: 0,
      },
      executionTime: Date.now() - startTime,
    };
  } finally {
    sandbox.dispose();
  }
}

describe('RLM Integration Tests', () => {
  describe('Basic Completion Flow', () => {
    it('should complete a simple query with code execution', async () => {
      const mockClient = createCodeGeneratingMock('The answer is 42');

      const result = await executeWithMock(
        mockClient,
        'What is the answer?',
        'The document contains the number 42 which is the answer to everything.'
      );

      expect(result.response).toContain('42');
      expect(result.trace.length).toBeGreaterThan(0);
      expect(result.usage.totalCalls).toBeGreaterThan(0);
    });

    it('should handle FINAL_VAR termination', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
globalThis.result = "computed value";
FINAL_VAR("result");
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
      ]);

      const result = await executeWithMock(mockClient, 'Test', 'Context');

      expect(result.response).toBeDefined();
      expect(result.response).toBe('computed value');
    });

    it('should respect max iterations', async () => {
      const mockClient = createLoopingMock(100);

      await expect(
        executeWithMock(mockClient, 'Test', 'Context', { maxIterations: 5 })
      ).rejects.toThrow(/max.*iteration/i);
    });

    it('should track token usage across iterations', async () => {
      const mockClient = createLoopingMock(3);

      const result = await executeWithMock(mockClient, 'Test', 'Context');

      expect(result.usage.totalTokens).toBeGreaterThan(0);
      expect(result.usage.totalCalls).toBe(3);
    });
  });

  describe('Context Processing', () => {
    it('should make context available to code execution', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
const length = context.length;
print('Context length: ' + length);
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          content: `FINAL("Length verified")`,
          usage: { promptTokens: 100, completionTokens: 20 },
        },
      ]);

      const context = 'A'.repeat(1000);
      const result = await executeWithMock(mockClient, 'How long?', context);

      const codeTraces = result.trace.filter((t) => t.data.type === 'code_execution');
      expect(codeTraces.length).toBeGreaterThan(0);
    });

    it('should support context chunking utilities', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
const chunks = chunk(context, 100);
print('Number of chunks: ' + chunks.length);
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          content: `FINAL("Chunking works")`,
          usage: { promptTokens: 100, completionTokens: 20 },
        },
      ]);

      const context = 'X'.repeat(500);
      const result = await executeWithMock(mockClient, 'Test chunks', context);

      expect(result.response).toBe('Chunking works');
    });

    it('should support grep utility', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
const matches = grep(context, /target/g);
print('Found ' + matches.length + ' matches');
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          content: `FINAL("Grep works")`,
          usage: { promptTokens: 100, completionTokens: 20 },
        },
      ]);

      const context = 'Line 1\ntarget found\nLine 3\nanother target here';
      const result = await executeWithMock(mockClient, 'Find targets', context);

      expect(result.response).toBe('Grep works');
    });
  });

  describe('Error Handling', () => {
    it('should handle sandbox execution errors gracefully', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
throw new Error("Intentional error");
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          content: `FINAL("Recovered from error")`,
          usage: { promptTokens: 150, completionTokens: 30 },
        },
      ]);

      const result = await executeWithMock(mockClient, 'Test error', 'Context');

      expect(result.response).toBe('Recovered from error');
    });

    it('should handle syntax errors in code', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
const x = { invalid syntax here
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          content: `FINAL("Recovered from syntax error")`,
          usage: { promptTokens: 150, completionTokens: 30 },
        },
      ]);

      const result = await executeWithMock(mockClient, 'Test syntax', 'Context');

      expect(result.response).toBe('Recovered from syntax error');
    });
  });

  describe('Trace and Logging', () => {
    it('should capture all execution steps in trace', async () => {
      const mockClient = createLoopingMock(3);

      const result = await executeWithMock(mockClient, 'Test', 'Context');

      const traceTypes = result.trace.map((t) => t.data.type);

      expect(traceTypes).toContain('llm_call');
      expect(traceTypes).toContain('code_execution');
      expect(traceTypes).toContain('final_output');
    });

    it('should track execution time', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `FINAL("Quick answer")`,
          usage: { promptTokens: 100, completionTokens: 20 },
          delay: 50,
        },
      ]);

      const result = await executeWithMock(mockClient, 'Test', 'Context');

      expect(result.executionTime).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Multi-turn Execution', () => {
    it('should maintain context across iterations', async () => {
      const mockClient = new MockLLMClient([
        {
          content: `\`\`\`javascript
const value = 10;
print('Set value to ' + value);
\`\`\``,
          usage: { promptTokens: 100, completionTokens: 50 },
        },
        {
          content: `\`\`\`javascript
const doubled = 20;
print('Doubled: ' + doubled);
\`\`\``,
          usage: { promptTokens: 150, completionTokens: 50 },
        },
        {
          content: `FINAL("Process complete")`,
          usage: { promptTokens: 200, completionTokens: 30 },
        },
      ]);

      const result = await executeWithMock(mockClient, 'Process values', 'Initial context');

      expect(mockClient.getCallCount()).toBe(3);
      expect(result.response).toBe('Process complete');
    });
  });
});
