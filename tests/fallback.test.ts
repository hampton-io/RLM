import { describe, it, expect, vi } from 'vitest';
import {
  FallbackChainClient,
  createFallbackChain,
  createProviderFallbackChain,
  createCostOptimizedChain,
  createQualityOptimizedChain,
  withFallback,
  isRateLimitError,
  isTimeoutError,
  isServerError,
  DEFAULT_FALLBACK_CHAINS,
  COST_OPTIMIZED_CHAIN,
  QUALITY_OPTIMIZED_CHAIN,
  type FallbackEvent,
} from '../src/fallback.js';
import type { SupportedModel } from '../src/types.js';

describe('Error Classification', () => {
  describe('isRateLimitError', () => {
    it('should detect rate limit errors', () => {
      expect(isRateLimitError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRateLimitError(new Error('rate_limit_exceeded'))).toBe(true);
      expect(isRateLimitError(new Error('Error 429: Too many requests'))).toBe(true);
      expect(isRateLimitError(new Error('Too many requests'))).toBe(true);
    });

    it('should not detect non-rate-limit errors', () => {
      expect(isRateLimitError(new Error('Invalid API key'))).toBe(false);
      expect(isRateLimitError(new Error('Server error'))).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    it('should detect timeout errors', () => {
      expect(isTimeoutError(new Error('Request timeout'))).toBe(true);
      expect(isTimeoutError(new Error('Connection timed out'))).toBe(true);
      expect(isTimeoutError(new Error('Deadline exceeded'))).toBe(true);
    });

    it('should not detect non-timeout errors', () => {
      expect(isTimeoutError(new Error('Invalid API key'))).toBe(false);
      expect(isTimeoutError(new Error('Rate limit exceeded'))).toBe(false);
    });
  });

  describe('isServerError', () => {
    it('should detect server errors', () => {
      expect(isServerError(new Error('500 Internal Server Error'))).toBe(true);
      expect(isServerError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isServerError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isServerError(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('should not detect client errors', () => {
      expect(isServerError(new Error('400 Bad Request'))).toBe(false);
      expect(isServerError(new Error('401 Unauthorized'))).toBe(false);
    });
  });
});

describe('Default Fallback Chains', () => {
  it('should have chains for all providers', () => {
    expect(DEFAULT_FALLBACK_CHAINS.openai).toBeDefined();
    expect(DEFAULT_FALLBACK_CHAINS.anthropic).toBeDefined();
    expect(DEFAULT_FALLBACK_CHAINS.google).toBeDefined();

    expect(DEFAULT_FALLBACK_CHAINS.openai.length).toBeGreaterThan(0);
    expect(DEFAULT_FALLBACK_CHAINS.anthropic.length).toBeGreaterThan(0);
    expect(DEFAULT_FALLBACK_CHAINS.google.length).toBeGreaterThan(0);
  });

  it('should have cost-optimized chain', () => {
    expect(COST_OPTIMIZED_CHAIN.length).toBeGreaterThan(0);
    // Cheapest models should be first
    expect(COST_OPTIMIZED_CHAIN[0]).toBe('gemini-2.0-flash-lite');
  });

  it('should have quality-optimized chain', () => {
    expect(QUALITY_OPTIMIZED_CHAIN.length).toBeGreaterThan(0);
    // Best models should be first
    expect(QUALITY_OPTIMIZED_CHAIN[0]).toBe('gpt-5');
  });
});

describe('FallbackChainClient', () => {
  it('should require at least one model', () => {
    expect(() => new FallbackChainClient({ models: [] })).toThrow(
      'requires at least one model'
    );
  });

  it('should set primary model from first in chain', () => {
    const client = new FallbackChainClient({
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-5'],
    });

    expect(client.model).toBe('gpt-4o-mini');
    expect(client.provider).toBe('openai');
  });

  it('should return model list', () => {
    const models: SupportedModel[] = ['claude-haiku-4-5', 'claude-sonnet-4-5'];
    const client = new FallbackChainClient({ models });

    expect(client.getModels()).toEqual(models);
    // Should return a copy
    expect(client.getModels()).not.toBe(models);
  });

  it('should add models to chain', () => {
    const client = new FallbackChainClient({
      models: ['gpt-4o-mini'],
    });

    client.addModel('gpt-4o');
    expect(client.getModels()).toContain('gpt-4o');

    // Should not add duplicates
    client.addModel('gpt-4o');
    expect(client.getModels().filter(m => m === 'gpt-4o').length).toBe(1);
  });

  it('should remove models from chain', () => {
    const client = new FallbackChainClient({
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-5'],
    });

    expect(client.removeModel('gpt-4o')).toBe(true);
    expect(client.getModels()).not.toContain('gpt-4o');

    // Should return false for non-existent model
    expect(client.removeModel('gpt-4o')).toBe(false);
  });

  // Note: countTokens test requires API key, tested via integration tests
});

describe('withFallback', () => {
  it('should return result on first success', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withFallback(
      operation,
      ['gpt-4o-mini', 'gpt-4o', 'gpt-5']
    );

    expect(result.result).toBe('success');
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.attempts).toBe(1);
    expect(result.failedModels).toHaveLength(0);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should fallback on retryable error', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValue('success from fallback');

    const onFallback = vi.fn();

    const result = await withFallback(
      operation,
      ['gpt-4o-mini', 'gpt-4o'],
      { onFallback }
    );

    expect(result.result).toBe('success from fallback');
    expect(result.model).toBe('gpt-4o');
    expect(result.attempts).toBe(2);
    expect(result.failedModels).toHaveLength(1);
    expect(result.failedModels[0].model).toBe('gpt-4o-mini');
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('should not fallback on non-retryable error', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Invalid API key'));

    await expect(
      withFallback(operation, ['gpt-4o-mini', 'gpt-4o'])
    ).rejects.toThrow('Invalid API key');

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should throw if all models fail', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockRejectedValueOnce(new Error('Server error 500'))
      .mockRejectedValue(new Error('Service unavailable'));

    await expect(
      withFallback(operation, ['gpt-4o-mini', 'gpt-4o', 'gpt-5'])
    ).rejects.toThrow('Service unavailable');

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should emit fallback events with correct data', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValue('success');

    const events: FallbackEvent[] = [];
    const onFallback = (event: FallbackEvent) => events.push(event);

    await withFallback(
      operation,
      ['gpt-4o-mini', 'gpt-4o', 'gpt-5'],
      { onFallback }
    );

    expect(events).toHaveLength(1);
    expect(events[0].failedModel).toBe('gpt-4o-mini');
    expect(events[0].nextModel).toBe('gpt-4o');
    expect(events[0].attempt).toBe(1);
    expect(events[0].totalModels).toBe(3);
    expect(events[0].error.message).toBe('Rate limit exceeded');
    expect(events[0].timestamp).toBeGreaterThan(0);
  });

  it('should respect custom shouldFallback function', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Custom error that should fallback'))
      .mockResolvedValue('success');

    const result = await withFallback(
      operation,
      ['gpt-4o-mini', 'gpt-4o'],
      {
        shouldFallback: (error) => error.message.includes('should fallback'),
      }
    );

    expect(result.model).toBe('gpt-4o');
  });

  it('should respect retryOnRateLimit option', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));

    await expect(
      withFallback(
        operation,
        ['gpt-4o-mini', 'gpt-4o'],
        { retryOnRateLimit: false }
      )
    ).rejects.toThrow('Rate limit exceeded');

    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('Factory Functions', () => {
  it('should create fallback chain with options', () => {
    const client = createFallbackChain({
      models: ['gpt-4o-mini', 'gpt-4o'],
    });

    expect(client).toBeInstanceOf(FallbackChainClient);
    expect(client.model).toBe('gpt-4o-mini');
  });

  it('should create provider fallback chain', () => {
    const openaiChain = createProviderFallbackChain('openai');
    expect(openaiChain.provider).toBe('openai');
    expect(openaiChain.getModels()).toEqual(DEFAULT_FALLBACK_CHAINS.openai);

    const anthropicChain = createProviderFallbackChain('anthropic');
    expect(anthropicChain.provider).toBe('anthropic');
    expect(anthropicChain.getModels()).toEqual(DEFAULT_FALLBACK_CHAINS.anthropic);
  });

  it('should create cost-optimized chain', () => {
    const chain = createCostOptimizedChain();
    expect(chain.getModels()).toEqual(COST_OPTIMIZED_CHAIN);
  });

  it('should create quality-optimized chain', () => {
    const chain = createQualityOptimizedChain();
    expect(chain.getModels()).toEqual(QUALITY_OPTIMIZED_CHAIN);
  });
});
