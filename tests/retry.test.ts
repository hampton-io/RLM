import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  withRetryResult,
  isRetryableError,
  calculateRetryDelay,
  createRetryWrapper,
} from '../src/utils/retry.js';

describe('Retry Utilities', () => {
  describe('isRetryableError', () => {
    it('should return true for rate limit errors', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Too many requests'))).toBe(true);
    });

    it('should return true for server errors', () => {
      expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
      expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('should return true for network errors', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('Connection refused'))).toBe(true);
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    });

    it('should return true for OpenAI overloaded errors', () => {
      expect(isRetryableError(new Error('The server is overloaded'))).toBe(true);
      expect(isRetryableError(new Error('At capacity'))).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
      expect(isRetryableError(new Error('Invalid request'))).toBe(false);
      expect(isRetryableError(new Error('Model not found'))).toBe(false);
    });

    it('should handle error objects with status codes', () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 400 })).toBe(false);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      const options = {
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: 0, // No jitter for predictable tests
      };

      expect(calculateRetryDelay(1, options)).toBe(1000);
      expect(calculateRetryDelay(2, options)).toBe(2000);
      expect(calculateRetryDelay(3, options)).toBe(4000);
      expect(calculateRetryDelay(4, options)).toBe(8000);
    });

    it('should cap at maxDelay', () => {
      const options = {
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: 0,
      };

      expect(calculateRetryDelay(10, options)).toBe(5000);
    });

    it('should add jitter within range', () => {
      const options = {
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: 0.5,
      };

      // With 50% jitter, delay should be between 500 and 1500 for attempt 1
      const delays = Array.from({ length: 100 }, () => calculateRetryDelay(1, options));
      const min = Math.min(...delays);
      const max = Math.max(...delays);

      expect(min).toBeGreaterThanOrEqual(500);
      expect(max).toBeLessThanOrEqual(1500);
    });
  });

  describe('withRetry', () => {
    it('should return result on immediate success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Rate limit exceeded'));

      await expect(
        withRetry(fn, { maxRetries: 2, initialDelay: 10 })
      ).rejects.toThrow('Rate limit exceeded');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));

      await expect(
        withRetry(fn, { maxRetries: 3, initialDelay: 10 })
      ).rejects.toThrow('Invalid API key');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValue('success');

      await withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number)
      );
    });

    it('should support custom isRetryable function', async () => {
      const customIsRetryable = (error: unknown) => {
        return error instanceof Error && error.message.includes('CUSTOM');
      };

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('CUSTOM error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        isRetryable: customIsRetryable,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetryResult', () => {
    it('should return success result', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetryResult(fn, { maxRetries: 3 });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should return failure result after retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Rate limit'));

      const result = await withRetryResult(fn, {
        maxRetries: 2,
        initialDelay: 10,
      });

      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.attempts).toBe(3);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Rate limit');
    });

    it('should track total delay', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValue('success');

      const result = await withRetryResult(fn, {
        maxRetries: 3,
        initialDelay: 50,
        jitter: 0,
      });

      expect(result.totalDelay).toBeGreaterThanOrEqual(50);
    });
  });

  describe('createRetryWrapper', () => {
    it('should create a wrapper with default options', async () => {
      const retryFn = createRetryWrapper({
        maxRetries: 2,
        initialDelay: 10,
      });

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValue('success');

      const result = await retryFn(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should allow overriding options', async () => {
      const retryFn = createRetryWrapper({
        maxRetries: 1,
        initialDelay: 10,
      });

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValue('success');

      const result = await retryFn(fn, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
