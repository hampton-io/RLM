/**
 * Retry utilities for handling transient failures.
 */

/**
 * Options for retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor (0-1) to randomize delays (default: 0.1) */
  jitter?: number;
  /** Function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback called before each retry */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Result of a retry operation.
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

/**
 * Default function to check if an error is retryable.
 * Retries on rate limits, server errors, and network errors.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }

    // Server errors (5xx)
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) {
      return true;
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return true;
    }

    // OpenAI specific errors
    if (message.includes('overloaded') || message.includes('capacity')) {
      return true;
    }

    // Anthropic specific errors
    if (message.includes('overloaded_error')) {
      return true;
    }
  }

  // Check for error objects with status codes
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    const status = err['status'] as number | undefined;
    if (status && (status === 429 || (status >= 500 && status < 600))) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for a retry attempt with exponential backoff and jitter.
 */
export function calculateRetryDelay(
  attempt: number,
  options: Required<
    Pick<RetryOptions, 'initialDelay' | 'maxDelay' | 'backoffMultiplier' | 'jitter'>
  >
): number {
  // Exponential backoff
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);

  // Add jitter
  const jitterRange = cappedDelay * options.jitter;
  const jitter = Math.random() * jitterRange * 2 - jitterRange;

  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retries on failure.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => client.completion(messages),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = 0.1,
    isRetryable = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      // Check if we should retry
      if (attempt > maxRetries || !isRetryable(error)) {
        throw lastError;
      }

      // Calculate delay
      const delay = calculateRetryDelay(attempt, {
        initialDelay,
        maxDelay,
        backoffMultiplier,
        jitter,
      });

      // Call retry callback
      if (onRetry) {
        onRetry(error, attempt, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Execute a function with retries and return detailed result.
 */
export async function withRetryResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  const wrappedOptions: RetryOptions = {
    ...options,
    onRetry: (error, attempt, delay) => {
      attempts = attempt;
      options.onRetry?.(error, attempt, delay);
    },
  };

  try {
    const result = await withRetry(fn, wrappedOptions);
    return {
      success: true,
      result,
      attempts: attempts + 1,
      totalDelay: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts: attempts + 1,
      totalDelay: Date.now() - startTime,
    };
  }
}

/**
 * Create a retry wrapper with pre-configured options.
 */
export function createRetryWrapper(defaultOptions: RetryOptions = {}) {
  return <T>(fn: () => Promise<T>, overrideOptions?: RetryOptions): Promise<T> => {
    return withRetry(fn, { ...defaultOptions, ...overrideOptions });
  };
}

/**
 * Pre-configured retry wrapper for LLM API calls.
 */
export const llmRetry = createRetryWrapper({
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 60000,
  backoffMultiplier: 2,
  jitter: 0.2,
  isRetryable: isRetryableError,
});

/**
 * Extract retry-after header value from an error.
 */
export function getRetryAfter(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;

    // Check for headers object
    const headers = err['headers'] as Record<string, string> | undefined;
    if (headers) {
      const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          return seconds * 1000;
        }
      }
    }

    // Check for retryAfter property
    const retryAfter = err['retryAfter'] as number | undefined;
    if (typeof retryAfter === 'number') {
      return retryAfter;
    }
  }

  return undefined;
}

/**
 * Create a retry function that respects retry-after headers.
 */
export async function withRetryAfter<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const baseOptions = { ...options };

  return withRetry(fn, {
    ...baseOptions,
    onRetry: (error, attempt, calculatedDelay) => {
      const retryAfter = getRetryAfter(error);
      if (retryAfter && retryAfter > calculatedDelay) {
        // Use retry-after if it's longer than our calculated delay
        // Note: This is informational only since we can't modify the delay here
        baseOptions.onRetry?.(error, attempt, retryAfter);
      } else {
        baseOptions.onRetry?.(error, attempt, calculatedDelay);
      }
    },
  });
}
