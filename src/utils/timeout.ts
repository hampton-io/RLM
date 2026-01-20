/**
 * Timeout utilities for handling long-running operations.
 */

/**
 * Result of a timeout-wrapped operation.
 */
export interface TimeoutResult<T> {
  /** Whether the operation completed successfully */
  completed: boolean;
  /** Whether the operation timed out */
  timedOut: boolean;
  /** The result if completed successfully */
  result?: T;
  /** The error if the operation failed */
  error?: Error;
  /** Time elapsed in milliseconds */
  elapsed: number;
  /** Partial result if available */
  partial?: Partial<T>;
}

/**
 * Options for timeout behavior.
 */
export interface TimeoutOptions<T = unknown> {
  /** Timeout duration in milliseconds */
  timeout: number;
  /** Function to get partial results on timeout */
  getPartialResult?: () => Partial<T> | undefined;
  /** Callback when timeout is approaching (called at 80% of timeout) */
  onApproachingTimeout?: (elapsed: number, remaining: number) => void;
  /** Signal to use for aborting the operation */
  signal?: AbortSignal;
}

/**
 * Error thrown when an operation times out.
 */
export class TimeoutError extends Error {
  readonly elapsed: number;
  readonly timeout: number;
  readonly partial?: unknown;

  constructor(message: string, timeout: number, elapsed: number, partial?: unknown) {
    super(message);
    this.name = 'TimeoutError';
    this.timeout = timeout;
    this.elapsed = elapsed;
    this.partial = partial;
  }
}

/**
 * Execute a function with a timeout.
 * Returns the result or throws TimeoutError with partial results if available.
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => longRunningTask(),
 *   { timeout: 30000 }
 * );
 * ```
 */
export async function withTimeout<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: TimeoutOptions<T>
): Promise<T> {
  const { timeout, getPartialResult, onApproachingTimeout, signal: externalSignal } = options;
  const startTime = Date.now();

  // Create an abort controller for timeout
  const controller = new AbortController();
  const combinedSignal = externalSignal
    ? combineAbortSignals(externalSignal, controller.signal)
    : controller.signal;

  // Set up approaching timeout callback
  let approachingTimeoutId: ReturnType<typeof setTimeout> | undefined;
  if (onApproachingTimeout) {
    const approachingTime = timeout * 0.8;
    approachingTimeoutId = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      onApproachingTimeout(elapsed, timeout - elapsed);
    }, approachingTime);
  }

  // Create timeout promise that rejects after the timeout
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const elapsed = Date.now() - startTime;
      const partial = getPartialResult?.();
      reject(
        new TimeoutError(
          `Operation timed out after ${elapsed}ms (limit: ${timeout}ms)`,
          timeout,
          elapsed,
          partial
        )
      );
    }, timeout);
  });

  try {
    // Race the operation against the timeout
    const result = await Promise.race([fn(combinedSignal), timeoutPromise]);
    return result;
  } catch (error) {
    // Check if external signal was aborted
    if (externalSignal?.aborted && !(error instanceof TimeoutError)) {
      throw new Error('Operation aborted');
    }

    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (approachingTimeoutId) {
      clearTimeout(approachingTimeoutId);
    }
  }
}

/**
 * Execute a function with a timeout and return a detailed result.
 */
export async function withTimeoutResult<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: TimeoutOptions<T>
): Promise<TimeoutResult<T>> {
  const startTime = Date.now();

  try {
    const result = await withTimeout(fn, options);
    return {
      completed: true,
      timedOut: false,
      result,
      elapsed: Date.now() - startTime,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;

    if (error instanceof TimeoutError) {
      return {
        completed: false,
        timedOut: true,
        elapsed,
        partial: error.partial as Partial<T> | undefined,
        error,
      };
    }

    return {
      completed: false,
      timedOut: false,
      error: error instanceof Error ? error : new Error(String(error)),
      elapsed,
    };
  }
}

/**
 * Combine multiple abort signals into one.
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Create a deadline from a timeout duration.
 */
export function createDeadline(timeoutMs: number): Date {
  return new Date(Date.now() + timeoutMs);
}

/**
 * Check if a deadline has passed.
 */
export function isDeadlinePassed(deadline: Date): boolean {
  return Date.now() >= deadline.getTime();
}

/**
 * Get remaining time until deadline.
 */
export function getRemainingTime(deadline: Date): number {
  return Math.max(0, deadline.getTime() - Date.now());
}

/**
 * A helper class for tracking execution time and partial progress.
 */
export class ExecutionTimer {
  private startTime: number;
  private checkpoints: Array<{ name: string; time: number }> = [];
  private timeout?: number;

  constructor(timeout?: number) {
    this.startTime = Date.now();
    this.timeout = timeout;
  }

  /**
   * Get elapsed time in milliseconds.
   */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if the timeout has been exceeded.
   */
  isExpired(): boolean {
    if (this.timeout === undefined) return false;
    return this.getElapsed() >= this.timeout;
  }

  /**
   * Get remaining time before timeout.
   */
  getRemaining(): number | undefined {
    if (!this.timeout) return undefined;
    return Math.max(0, this.timeout - this.getElapsed());
  }

  /**
   * Check if we're approaching the timeout (80% elapsed).
   */
  isApproachingTimeout(): boolean {
    if (!this.timeout) return false;
    return this.getElapsed() >= this.timeout * 0.8;
  }

  /**
   * Record a checkpoint.
   */
  checkpoint(name: string): void {
    this.checkpoints.push({ name, time: this.getElapsed() });
  }

  /**
   * Get all checkpoints.
   */
  getCheckpoints(): Array<{ name: string; time: number }> {
    return [...this.checkpoints];
  }

  /**
   * Get a summary of the execution.
   */
  getSummary(): {
    elapsed: number;
    remaining?: number;
    expired: boolean;
    checkpoints: Array<{ name: string; time: number }>;
  } {
    return {
      elapsed: this.getElapsed(),
      remaining: this.getRemaining(),
      expired: this.isExpired(),
      checkpoints: this.getCheckpoints(),
    };
  }
}

/**
 * Create a promise that rejects after a timeout.
 */
export function createTimeoutPromise(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(message ?? `Timeout after ${ms}ms`, ms, ms));
    }, ms);
  });
}

/**
 * Race a promise against a timeout.
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return Promise.race([promise, createTimeoutPromise(timeoutMs, message)]);
}
