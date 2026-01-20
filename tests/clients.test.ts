import { describe, it, expect, vi } from 'vitest';
import { MockLLMClient, createErrorMock, createFlakeyMock } from './helpers/mock-client.js';
import { ResilientClient } from '../src/clients/resilient-client.js';
import { calculateCost, detectProvider, MODEL_PRICING } from '../src/clients/types.js';

describe('LLM Clients', () => {
  describe('MockLLMClient', () => {
    it('should return mock responses', async () => {
      const client = new MockLLMClient([
        { content: 'Response 1', usage: { promptTokens: 100, completionTokens: 50 } },
        { content: 'Response 2', usage: { promptTokens: 150, completionTokens: 75 } },
      ]);

      const result1 = await client.completion([{ role: 'user', content: 'Hello' }]);
      expect(result1.content).toBe('Response 1');
      expect(result1.usage.promptTokens).toBe(100);

      const result2 = await client.completion([{ role: 'user', content: 'World' }]);
      expect(result2.content).toBe('Response 2');
      expect(result2.usage.promptTokens).toBe(150);
    });

    it('should track call history', async () => {
      const client = new MockLLMClient([{ content: 'Response' }]);

      await client.completion([{ role: 'user', content: 'Test message' }]);

      const history = client.getCallHistory();
      expect(history).toHaveLength(1);
      expect(history[0].messages[0].content).toBe('Test message');
    });

    it('should throw configured errors', async () => {
      const client = createErrorMock(new Error('API Error'));

      await expect(
        client.completion([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('API Error');
    });

    it('should support delays', async () => {
      const client = new MockLLMClient([
        { content: 'Delayed response', delay: 50 },
      ]);

      const start = Date.now();
      await client.completion([{ role: 'user', content: 'Hello' }]);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('should support streaming', async () => {
      const client = new MockLLMClient([
        { content: 'Hello world from mock' },
      ]);

      const chunks: string[] = [];
      const generator = client.streamCompletion([{ role: 'user', content: 'Hi' }]);

      for await (const chunk of generator) {
        chunks.push(chunk.content);
      }

      expect(chunks.join('')).toContain('Hello');
      expect(chunks.join('')).toContain('world');
    });

    it('should reset properly', async () => {
      const client = new MockLLMClient([{ content: 'First' }]);

      await client.completion([{ role: 'user', content: 'Hello' }]);
      expect(client.getCallCount()).toBe(1);

      client.reset();
      expect(client.getCallCount()).toBe(0);
    });
  });

  describe('ResilientClient', () => {
    it('should pass through successful calls', async () => {
      const mockClient = new MockLLMClient([
        { content: 'Success', usage: { promptTokens: 100, completionTokens: 50 } },
      ]);

      const resilientClient = new ResilientClient(mockClient);

      const result = await resilientClient.completion([
        { role: 'user', content: 'Hello' },
      ]);

      expect(result.content).toBe('Success');
      expect(mockClient.getCallCount()).toBe(1);
    });

    it('should retry on retryable errors', async () => {
      const mockClient = createFlakeyMock(2, 'Success after retry');

      const resilientClient = new ResilientClient(mockClient, {
        maxRetries: 3,
        initialDelay: 10,
      });

      const result = await resilientClient.completion([
        { role: 'user', content: 'Hello' },
      ]);

      expect(result.content).toContain('Success after retry');
      expect(mockClient.getCallCount()).toBe(3); // 2 failures + 1 success
    });

    it('should throw after max retries', async () => {
      const mockClient = new MockLLMClient([
        { content: '', error: new Error('Rate limit exceeded') },
        { content: '', error: new Error('Rate limit exceeded') },
        { content: '', error: new Error('Rate limit exceeded') },
        { content: '', error: new Error('Rate limit exceeded') },
      ]);

      const resilientClient = new ResilientClient(mockClient, {
        maxRetries: 2,
        initialDelay: 10,
      });

      await expect(
        resilientClient.completion([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockClient.getCallCount()).toBe(3); // 1 initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const mockClient = createErrorMock(new Error('Invalid API key'));

      const resilientClient = new ResilientClient(mockClient, {
        maxRetries: 3,
        initialDelay: 10,
      });

      await expect(
        resilientClient.completion([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Invalid API key');

      expect(mockClient.getCallCount()).toBe(1);
    });

    it('should log retries when configured', async () => {
      const mockClient = createFlakeyMock(1, 'Success');
      const logger = vi.fn();

      const resilientClient = new ResilientClient(mockClient, {
        maxRetries: 3,
        initialDelay: 10,
        logRetries: true,
        logger,
      });

      await resilientClient.completion([{ role: 'user', content: 'Hello' }]);

      expect(logger).toHaveBeenCalled();
      expect(logger).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt')
      );
    });

    it('should expose provider and model from underlying client', () => {
      const mockClient = new MockLLMClient([]);
      const resilientClient = new ResilientClient(mockClient);

      expect(resilientClient.provider).toBe('mock');
      expect(resilientClient.model).toBe('mock-model');
    });

    it('should support streaming with retries', async () => {
      // First call fails, second succeeds
      const mockClient = new MockLLMClient([
        { content: '', error: new Error('Rate limit exceeded') },
        { content: 'Streamed content here' },
      ]);

      const resilientClient = new ResilientClient(mockClient, {
        maxRetries: 2,
        initialDelay: 10,
      });

      const chunks: string[] = [];
      const generator = resilientClient.streamCompletion([
        { role: 'user', content: 'Hello' },
      ]);

      for await (const chunk of generator) {
        chunks.push(chunk.content);
      }

      expect(chunks.join('')).toContain('Streamed');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for GPT-4o', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const cost = calculateCost('gpt-4o', usage);

      // GPT-4o: $2.5/1M input, $10/1M output
      // Expected: (1000/1M * 2.5) + (500/1M * 10) = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 4);
    });

    it('should calculate cost for GPT-4o-mini', () => {
      const usage = {
        promptTokens: 10000,
        completionTokens: 5000,
        totalTokens: 15000,
      };

      const cost = calculateCost('gpt-4o-mini', usage);

      // GPT-4o-mini: $0.15/1M input, $0.6/1M output
      // Expected: (10000/1M * 0.15) + (5000/1M * 0.6) = 0.0015 + 0.003 = 0.0045
      expect(cost).toBeCloseTo(0.0045, 4);
    });

    it('should calculate cost for Claude-3.5-Sonnet', () => {
      const usage = {
        promptTokens: 1000000,
        completionTokens: 500000,
        totalTokens: 1500000,
      };

      const cost = calculateCost('claude-3-5-sonnet-latest', usage);

      // Claude: $3/1M input, $15/1M output
      // Expected: (1M/1M * 3) + (500K/1M * 15) = 3 + 7.5 = 10.5
      expect(cost).toBeCloseTo(10.5, 1);
    });

    it('should return 0 for unknown models', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      };

      const cost = calculateCost('unknown-model', usage);

      expect(cost).toBe(0);
    });
  });

  describe('detectProvider', () => {
    it('should detect OpenAI models', () => {
      expect(detectProvider('gpt-4o')).toBe('openai');
      expect(detectProvider('gpt-4o-mini')).toBe('openai');
      expect(detectProvider('gpt-4-turbo')).toBe('openai');
      expect(detectProvider('gpt-3.5-turbo')).toBe('openai');
    });

    it('should detect Anthropic models', () => {
      expect(detectProvider('claude-3-5-sonnet-latest')).toBe('anthropic');
      expect(detectProvider('claude-3-5-haiku-latest')).toBe('anthropic');
      expect(detectProvider('claude-3-opus-latest')).toBe('anthropic');
    });

    it('should default to OpenAI for unknown models', () => {
      expect(detectProvider('unknown-model')).toBe('openai');
    });
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for OpenAI models', () => {
      expect(MODEL_PRICING['gpt-4o']).toBeDefined();
      expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
      expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
      expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined();
    });

    it('should have pricing for Anthropic models', () => {
      expect(MODEL_PRICING['claude-3-5-sonnet-latest']).toBeDefined();
      expect(MODEL_PRICING['claude-3-5-haiku-latest']).toBeDefined();
      expect(MODEL_PRICING['claude-3-opus-latest']).toBeDefined();
    });

    it('should have input and output prices', () => {
      for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing.inputPer1M).toBeGreaterThan(0);
        expect(pricing.outputPer1M).toBeGreaterThan(0);
      }
    });
  });
});
