/**
 * Rate limiter for API calls using token bucket algorithm.
 *
 * Supports both request-based and token-based rate limiting.
 */

export interface RateLimiterOptions {
  /** Maximum requests per minute (default: 60) */
  requestsPerMinute?: number;
  /** Maximum tokens per minute (default: 100000) */
  tokensPerMinute?: number;
  /** Maximum concurrent requests (default: 10) */
  maxConcurrent?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per ms
}

/**
 * Rate limiter that enforces request and token limits.
 */
export class RateLimiter {
  private requestBucket: TokenBucket;
  private tokenBucket: TokenBucket;
  private concurrentRequests = 0;
  private maxConcurrent: number;
  private waitingQueue: Array<{
    resolve: () => void;
    tokensNeeded: number;
  }> = [];

  constructor(options: RateLimiterOptions = {}) {
    const requestsPerMinute = options.requestsPerMinute ?? 60;
    const tokensPerMinute = options.tokensPerMinute ?? 100000;
    this.maxConcurrent = options.maxConcurrent ?? 10;

    // Initialize request bucket (refills to max per minute)
    this.requestBucket = {
      tokens: requestsPerMinute,
      lastRefill: Date.now(),
      maxTokens: requestsPerMinute,
      refillRate: requestsPerMinute / 60000, // per ms
    };

    // Initialize token bucket (refills to max per minute)
    this.tokenBucket = {
      tokens: tokensPerMinute,
      lastRefill: Date.now(),
      maxTokens: tokensPerMinute,
      refillRate: tokensPerMinute / 60000, // per ms
    };
  }

  /**
   * Refill a bucket based on elapsed time.
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Check if we can proceed with a request.
   */
  private canProceed(estimatedTokens: number): boolean {
    this.refillBucket(this.requestBucket);
    this.refillBucket(this.tokenBucket);

    return (
      this.requestBucket.tokens >= 1 &&
      this.tokenBucket.tokens >= estimatedTokens &&
      this.concurrentRequests < this.maxConcurrent
    );
  }

  /**
   * Calculate wait time until we can proceed.
   */
  private getWaitTime(estimatedTokens: number): number {
    this.refillBucket(this.requestBucket);
    this.refillBucket(this.tokenBucket);

    const requestWait =
      this.requestBucket.tokens >= 1
        ? 0
        : (1 - this.requestBucket.tokens) / this.requestBucket.refillRate;

    const tokenWait =
      this.tokenBucket.tokens >= estimatedTokens
        ? 0
        : (estimatedTokens - this.tokenBucket.tokens) / this.tokenBucket.refillRate;

    // If concurrent limit reached, estimate based on average request time
    const concurrentWait = this.concurrentRequests >= this.maxConcurrent ? 1000 : 0;

    return Math.max(requestWait, tokenWait, concurrentWait);
  }

  /**
   * Acquire permission to make a request.
   * Returns a release function that must be called when the request completes.
   *
   * @param estimatedTokens - Estimated token usage for this request
   * @returns Promise that resolves to a release function
   */
  async acquire(estimatedTokens: number = 1000): Promise<() => void> {
    // Wait until we can proceed
    while (!this.canProceed(estimatedTokens)) {
      const waitTime = this.getWaitTime(estimatedTokens);
      await this.sleep(Math.max(10, Math.min(waitTime, 5000)));
    }

    // Consume tokens
    this.requestBucket.tokens -= 1;
    this.tokenBucket.tokens -= estimatedTokens;
    this.concurrentRequests++;

    // Return release function
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.concurrentRequests--;
        this.processQueue();
      }
    };
  }

  /**
   * Record actual token usage after request completes.
   * Use this to adjust the token bucket based on actual usage.
   *
   * @param estimatedTokens - The estimate used when acquiring
   * @param actualTokens - The actual tokens used
   */
  recordUsage(estimatedTokens: number, actualTokens: number): void {
    // Adjust token bucket based on actual vs estimated
    const difference = estimatedTokens - actualTokens;
    if (difference > 0) {
      // We overestimated, give back some tokens (but don't exceed max)
      this.tokenBucket.tokens = Math.min(
        this.tokenBucket.maxTokens,
        this.tokenBucket.tokens + difference
      );
    } else if (difference < 0) {
      // We underestimated, consume more tokens
      this.tokenBucket.tokens = Math.max(0, this.tokenBucket.tokens + difference);
    }
  }

  /**
   * Process any waiting requests in the queue.
   */
  private processQueue(): void {
    while (this.waitingQueue.length > 0) {
      const first = this.waitingQueue[0];
      if (this.canProceed(first.tokensNeeded)) {
        this.waitingQueue.shift();
        first.resolve();
      } else {
        break;
      }
    }
  }

  /**
   * Get current rate limiter status.
   */
  getStatus(): {
    requestsAvailable: number;
    tokensAvailable: number;
    concurrentRequests: number;
    maxConcurrent: number;
    queueLength: number;
  } {
    this.refillBucket(this.requestBucket);
    this.refillBucket(this.tokenBucket);

    return {
      requestsAvailable: Math.floor(this.requestBucket.tokens),
      tokensAvailable: Math.floor(this.tokenBucket.tokens),
      concurrentRequests: this.concurrentRequests,
      maxConcurrent: this.maxConcurrent,
      queueLength: this.waitingQueue.length,
    };
  }

  /**
   * Reset the rate limiter to initial state.
   */
  reset(): void {
    this.requestBucket.tokens = this.requestBucket.maxTokens;
    this.requestBucket.lastRefill = Date.now();
    this.tokenBucket.tokens = this.tokenBucket.maxTokens;
    this.tokenBucket.lastRefill = Date.now();
    this.concurrentRequests = 0;
    this.waitingQueue = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a rate-limited wrapper for an async function.
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  limiter: RateLimiter,
  estimateTokens: (...args: Parameters<T>) => number = () => 1000
): T {
  return (async (...args: Parameters<T>) => {
    const estimated = estimateTokens(...args);
    const release = await limiter.acquire(estimated);
    try {
      return await fn(...args);
    } finally {
      release();
    }
  }) as T;
}

/**
 * Default rate limiters for common providers.
 */
export const PROVIDER_RATE_LIMITS = {
  openai: {
    requestsPerMinute: 500,
    tokensPerMinute: 150000,
    maxConcurrent: 50,
  },
  anthropic: {
    requestsPerMinute: 50,
    tokensPerMinute: 100000,
    maxConcurrent: 10,
  },
} as const;

/**
 * Create a rate limiter for a specific provider.
 */
export function createProviderRateLimiter(
  provider: 'openai' | 'anthropic',
  overrides?: Partial<RateLimiterOptions>
): RateLimiter {
  const defaults = PROVIDER_RATE_LIMITS[provider];
  return new RateLimiter({ ...defaults, ...overrides });
}
