import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimiter,
  withRateLimit,
  createProviderRateLimiter,
  PROVIDER_RATE_LIMITS,
} from '../src/rate-limiter.js';

describe('Rate Limiter Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RateLimiter', () => {
    describe('Token bucket exhaustion', () => {
      it('should allow requests within limits', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 10,
          tokensPerMinute: 1000,
          maxConcurrent: 10,
        });

        // Should allow 10 requests
        for (let i = 0; i < 10; i++) {
          const release = await limiter.acquire(50);
          release(); // Release immediately
        }
      });

      it('should block when token limit exceeded', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 100,
          tokensPerMinute: 500,
          maxConcurrent: 100,
        });

        // Use up all tokens
        const release = await limiter.acquire(500);
        release();

        // Next request should wait for refill
        const acquirePromise = limiter.acquire(100);

        // Advance time to allow refill
        vi.advanceTimersByTime(15000); // 15 seconds - partial refill

        const release2 = await acquirePromise;
        release2();
      });

      it('should block when request limit exceeded', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 5,
          tokensPerMinute: 10000,
          maxConcurrent: 10,
        });

        // Use up all requests
        const releases: Array<() => void> = [];
        for (let i = 0; i < 5; i++) {
          const release = await limiter.acquire(10);
          releases.push(release);
          release(); // Release to allow next iteration
        }

        // Next request should wait
        const acquirePromise = limiter.acquire(10);

        // Advance time
        vi.advanceTimersByTime(15000);

        const release = await acquirePromise;
        release();
      });
    });

    describe('Request rate limiting', () => {
      it('should enforce requests per minute limit', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 3,
          tokensPerMinute: 100000,
          maxConcurrent: 10,
        });

        // Make 3 quick requests
        for (let i = 0; i < 3; i++) {
          const release = await limiter.acquire(10);
          release();
        }

        // 4th request should be delayed
        const fourthPromise = limiter.acquire(10);

        // Without advancing time, should not resolve immediately
        let resolved = false;
        fourthPromise.then(() => { resolved = true; });

        // Give a tick to see if it resolves
        await vi.advanceTimersByTimeAsync(100);

        // Should still be waiting
        expect(resolved).toBe(false);

        // Advance to allow refill
        await vi.advanceTimersByTimeAsync(20000);

        const release = await fourthPromise;
        release();
      });
    });

    describe('Concurrent request handling', () => {
      it('should handle concurrent requests fairly', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 100,
          tokensPerMinute: 10000,
          maxConcurrent: 5,
        });

        const results: number[] = [];
        const promises: Promise<void>[] = [];

        // Launch 10 concurrent requests
        for (let i = 0; i < 10; i++) {
          const index = i;
          promises.push(
            (async () => {
              const release = await limiter.acquire(10);
              results.push(index);
              // Simulate some work
              await vi.advanceTimersByTimeAsync(100);
              release();
            })()
          );
        }

        // First batch should start processing
        await vi.advanceTimersByTimeAsync(100);

        // Eventually all should complete
        await vi.advanceTimersByTimeAsync(60000);
        await Promise.all(promises);
        expect(results.length).toBe(10);
      });

      it('should enforce max concurrent limit', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 100,
          tokensPerMinute: 100000,
          maxConcurrent: 2,
        });

        const status1 = limiter.getStatus();
        expect(status1.maxConcurrent).toBe(2);
        expect(status1.concurrentRequests).toBe(0);

        // Hold two requests
        const release1 = await limiter.acquire(10);
        const release2 = await limiter.acquire(10);

        const statusHeld = limiter.getStatus();
        expect(statusHeld.concurrentRequests).toBe(2);

        // Release one
        release1();
        const statusAfterRelease = limiter.getStatus();
        expect(statusAfterRelease.concurrentRequests).toBe(1);

        release2();
      });
    });

    describe('Provider-specific limits', () => {
      it('should have OpenAI rate limits defined', () => {
        expect(PROVIDER_RATE_LIMITS.openai).toBeDefined();
        expect(PROVIDER_RATE_LIMITS.openai.requestsPerMinute).toBeGreaterThan(0);
        expect(PROVIDER_RATE_LIMITS.openai.tokensPerMinute).toBeGreaterThan(0);
      });

      it('should have Anthropic rate limits defined', () => {
        expect(PROVIDER_RATE_LIMITS.anthropic).toBeDefined();
        expect(PROVIDER_RATE_LIMITS.anthropic.requestsPerMinute).toBeGreaterThan(0);
        expect(PROVIDER_RATE_LIMITS.anthropic.tokensPerMinute).toBeGreaterThan(0);
      });

      it('should create provider-specific limiter', () => {
        const openaiLimiter = createProviderRateLimiter('openai');
        const anthropicLimiter = createProviderRateLimiter('anthropic');

        expect(openaiLimiter).toBeInstanceOf(RateLimiter);
        expect(anthropicLimiter).toBeInstanceOf(RateLimiter);
      });

      it('should allow overrides for provider limiters', () => {
        const customLimiter = createProviderRateLimiter('openai', {
          maxConcurrent: 5,
        });

        const status = customLimiter.getStatus();
        expect(status.maxConcurrent).toBe(5);
      });
    });

    describe('Rate limit recovery', () => {
      it('should recover capacity over time', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 6,
          tokensPerMinute: 600,
          maxConcurrent: 10,
        });

        // Use all capacity
        for (let i = 0; i < 6; i++) {
          const release = await limiter.acquire(100);
          release();
        }

        // Get stats
        const initialStatus = limiter.getStatus();
        expect(initialStatus.requestsAvailable).toBeLessThanOrEqual(0);

        // Wait for partial recovery (30 seconds = half a minute)
        vi.advanceTimersByTime(30000);

        const recoveredStatus = limiter.getStatus();
        expect(recoveredStatus.requestsAvailable).toBeGreaterThan(initialStatus.requestsAvailable);
      });

      it('should fully recover after one minute', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 10,
          tokensPerMinute: 1000,
          maxConcurrent: 10,
        });

        // Use all capacity
        for (let i = 0; i < 10; i++) {
          const release = await limiter.acquire(100);
          release();
        }

        // Wait full minute
        vi.advanceTimersByTime(60000);

        // Should be fully recovered
        const status = limiter.getStatus();
        expect(status.requestsAvailable).toBeGreaterThanOrEqual(10);
        expect(status.tokensAvailable).toBeGreaterThanOrEqual(1000);
      });

      it('should reset limiter to initial state', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 10,
          tokensPerMinute: 1000,
          maxConcurrent: 10,
        });

        // Use some capacity
        const release = await limiter.acquire(500);
        release();

        const statusBefore = limiter.getStatus();
        expect(statusBefore.requestsAvailable).toBeLessThan(10);

        // Reset
        limiter.reset();

        const statusAfter = limiter.getStatus();
        expect(statusAfter.requestsAvailable).toBe(10);
        expect(statusAfter.tokensAvailable).toBe(1000);
      });
    });

    describe('Token usage recording', () => {
      it('should adjust tokens when actual usage differs from estimate', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 100,
          tokensPerMinute: 1000,
          maxConcurrent: 10,
        });

        // Acquire with estimate of 500
        const release = await limiter.acquire(500);

        // Record that we only used 300
        limiter.recordUsage(500, 300);

        release();

        // Should have more tokens available (200 returned)
        const status = limiter.getStatus();
        expect(status.tokensAvailable).toBeGreaterThan(500);
      });

      it('should handle underestimation', async () => {
        const limiter = new RateLimiter({
          requestsPerMinute: 100,
          tokensPerMinute: 1000,
          maxConcurrent: 10,
        });

        // Acquire with estimate of 300
        const release = await limiter.acquire(300);

        // Record that we actually used 500
        limiter.recordUsage(300, 500);

        release();

        // Should have fewer tokens available
        const status = limiter.getStatus();
        expect(status.tokensAvailable).toBeLessThan(700); // 1000 - 300 - 200 extra
      });
    });
  });

  describe('withRateLimit wrapper', () => {
    it('should wrap async function with rate limiting', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 100,
        tokensPerMinute: 10000,
        maxConcurrent: 10,
      });

      const mockFn = vi.fn().mockResolvedValue('result');
      const wrapped = withRateLimit(mockFn, limiter, () => 50);

      const result = await wrapped();

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalled();
    });

    it('should apply rate limiting to wrapped function', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 2,
        tokensPerMinute: 10000,
        maxConcurrent: 10,
      });

      const mockFn = vi.fn().mockResolvedValue('result');
      const wrapped = withRateLimit(mockFn, limiter, () => 10);

      // Make 2 calls quickly
      await wrapped();
      await wrapped();

      // 3rd call should wait
      const thirdPromise = wrapped();

      let resolved = false;
      thirdPromise.then(() => { resolved = true; });

      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(false);

      // After waiting
      await vi.advanceTimersByTimeAsync(30000);
      await thirdPromise;

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should pass arguments through to wrapped function', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 100,
        tokensPerMinute: 10000,
        maxConcurrent: 10,
      });

      const mockFn = vi.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));
      const wrapped = withRateLimit(mockFn, limiter, () => 10);

      const result = await wrapped(1, 2);

      expect(result).toBe(3);
      expect(mockFn).toHaveBeenCalledWith(1, 2);
    });

    it('should propagate errors from wrapped function', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 100,
        tokensPerMinute: 10000,
        maxConcurrent: 10,
      });

      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));
      const wrapped = withRateLimit(mockFn, limiter, () => 10);

      await expect(wrapped()).rejects.toThrow('Test error');
    });

    it('should estimate tokens based on arguments', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 100,
        tokensPerMinute: 1000,
        maxConcurrent: 10,
      });

      const mockFn = vi.fn().mockImplementation((text: string) => Promise.resolve(text.toUpperCase()));
      const estimator = (text: string) => text.length * 2;
      const wrapped = withRateLimit(mockFn, limiter, estimator);

      const statusBefore = limiter.getStatus();
      expect(statusBefore.tokensAvailable).toBe(1000);

      await wrapped('hello'); // Should consume ~10 tokens

      // Tokens should be consumed based on estimate
      const statusAfter = limiter.getStatus();
      expect(statusAfter.tokensAvailable).toBeLessThan(1000);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero token requests', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 10,
        tokensPerMinute: 1000,
        maxConcurrent: 10,
      });

      const release = await limiter.acquire(0);
      release();
    });

    it('should handle large token requests that exceed capacity', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 100,
        tokensPerMinute: 1000,
        maxConcurrent: 10,
      });

      // Request more tokens than available - should queue
      const acquirePromise = limiter.acquire(800);

      // Use up some time to allow token refill
      await vi.advanceTimersByTimeAsync(30000);

      const release = await acquirePromise;
      release();
    });

    it('should handle rapid successive calls', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 1000,
        tokensPerMinute: 100000,
        maxConcurrent: 100,
      });

      const releases = await Promise.all(
        Array.from({ length: 100 }, () => limiter.acquire(10))
      );

      // All should have acquired successfully
      expect(releases.length).toBe(100);

      // Release all
      releases.forEach(release => release());
    });

    it('should track queue length', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 100,
        tokensPerMinute: 100,
        maxConcurrent: 10,
      });

      // Use up all tokens
      const release1 = await limiter.acquire(100);

      // Queue up more requests (these will wait)
      const promises = [
        limiter.acquire(50),
        limiter.acquire(50),
      ];

      const status = limiter.getStatus();
      expect(status.queueLength).toBeGreaterThanOrEqual(0);

      // Cleanup
      release1();
      vi.advanceTimersByTime(60000);
      const releases = await Promise.all(promises);
      releases.forEach(r => r());
    });
  });

  describe('getStatus', () => {
    it('should return accurate status information', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 10,
        tokensPerMinute: 1000,
        maxConcurrent: 5,
      });

      const status = limiter.getStatus();

      expect(status).toHaveProperty('requestsAvailable');
      expect(status).toHaveProperty('tokensAvailable');
      expect(status).toHaveProperty('concurrentRequests');
      expect(status).toHaveProperty('maxConcurrent');
      expect(status).toHaveProperty('queueLength');

      expect(status.requestsAvailable).toBe(10);
      expect(status.tokensAvailable).toBe(1000);
      expect(status.concurrentRequests).toBe(0);
      expect(status.maxConcurrent).toBe(5);
      expect(status.queueLength).toBe(0);
    });

    it('should update status after acquire', async () => {
      const limiter = new RateLimiter({
        requestsPerMinute: 10,
        tokensPerMinute: 1000,
        maxConcurrent: 5,
      });

      const release = await limiter.acquire(200);

      const status = limiter.getStatus();
      expect(status.requestsAvailable).toBe(9);
      expect(status.tokensAvailable).toBe(800);
      expect(status.concurrentRequests).toBe(1);

      release();

      const statusAfterRelease = limiter.getStatus();
      expect(statusAfterRelease.concurrentRequests).toBe(0);
    });
  });
});
