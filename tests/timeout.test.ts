import { describe, it, expect, vi } from 'vitest';
import {
  withTimeout,
  withTimeoutResult,
  TimeoutError,
  ExecutionTimer,
  createDeadline,
  isDeadlinePassed,
  getRemainingTime,
  raceWithTimeout,
} from '../src/utils/timeout.js';

describe('Timeout Utilities', () => {
  describe('withTimeout', () => {
    it('should return result when operation completes in time', async () => {
      const result = await withTimeout(
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'success';
        },
        { timeout: 1000 }
      );

      expect(result).toBe('success');
    });

    it('should throw TimeoutError when operation exceeds timeout', async () => {
      await expect(
        withTimeout(
          async () => {
            await new Promise((r) => setTimeout(r, 200));
            return 'success';
          },
          { timeout: 50 }
        )
      ).rejects.toThrow(TimeoutError);
    });

    it('should include partial results in TimeoutError', async () => {
      let partialData = '';

      try {
        await withTimeout(
          async () => {
            partialData = 'partial';
            await new Promise((r) => setTimeout(r, 200));
            return 'complete';
          },
          {
            timeout: 50,
            getPartialResult: () => ({ data: partialData }),
          }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        const timeoutError = error as TimeoutError;
        expect(timeoutError.partial).toEqual({ data: 'partial' });
      }
    });

    it('should call onApproachingTimeout at 80% of timeout', async () => {
      const onApproaching = vi.fn();

      await withTimeout(
        async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'success';
        },
        {
          timeout: 120,
          onApproachingTimeout: onApproaching,
        }
      );

      // Should have been called around 96ms (80% of 120ms)
      expect(onApproaching).toHaveBeenCalled();
    });

    it('should pass abort signal to function', async () => {
      let receivedSignal: AbortSignal | undefined;

      await withTimeout(
        async (signal) => {
          receivedSignal = signal;
          return 'success';
        },
        { timeout: 1000 }
      );

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal?.aborted).toBe(false);
    });

    it('should abort signal on timeout', async () => {
      let signalAborted = false;

      try {
        await withTimeout(
          async (signal) => {
            signal?.addEventListener('abort', () => {
              signalAborted = true;
            });
            await new Promise((r) => setTimeout(r, 200));
            return 'success';
          },
          { timeout: 50 }
        );
      } catch {
        // Expected timeout
      }

      expect(signalAborted).toBe(true);
    });
  });

  describe('withTimeoutResult', () => {
    it('should return completed result on success', async () => {
      const result = await withTimeoutResult(
        async () => 'success',
        { timeout: 1000 }
      );

      expect(result.completed).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.result).toBe('success');
      expect(result.error).toBeUndefined();
    });

    it('should return timeout result on timeout', async () => {
      const result = await withTimeoutResult(
        async () => {
          await new Promise((r) => setTimeout(r, 200));
          return 'success';
        },
        { timeout: 50 }
      );

      expect(result.completed).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.result).toBeUndefined();
      expect(result.error).toBeInstanceOf(TimeoutError);
    });

    it('should return error result on exception', async () => {
      const result = await withTimeoutResult(
        async () => {
          throw new Error('Test error');
        },
        { timeout: 1000 }
      );

      expect(result.completed).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.error?.message).toBe('Test error');
    });

    it('should include elapsed time', async () => {
      const result = await withTimeoutResult(
        async () => {
          await new Promise((r) => setTimeout(r, 50));
          return 'success';
        },
        { timeout: 1000 }
      );

      expect(result.elapsed).toBeGreaterThanOrEqual(45);
    });

    it('should include partial results on timeout', async () => {
      const result = await withTimeoutResult(
        async () => {
          await new Promise((r) => setTimeout(r, 200));
          return { data: 'complete' };
        },
        {
          timeout: 50,
          getPartialResult: () => ({ data: 'partial' }),
        }
      );

      expect(result.timedOut).toBe(true);
      expect(result.partial).toEqual({ data: 'partial' });
    });
  });

  describe('TimeoutError', () => {
    it('should have correct properties', () => {
      const error = new TimeoutError('Test message', 5000, 5001, { partial: true });

      expect(error.message).toBe('Test message');
      expect(error.name).toBe('TimeoutError');
      expect(error.timeout).toBe(5000);
      expect(error.elapsed).toBe(5001);
      expect(error.partial).toEqual({ partial: true });
    });

    it('should be instanceof Error', () => {
      const error = new TimeoutError('Test', 1000, 1001);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('ExecutionTimer', () => {
    it('should track elapsed time', async () => {
      const timer = new ExecutionTimer();

      await new Promise((r) => setTimeout(r, 55));

      // Allow small timing variance (timers can fire slightly early)
      expect(timer.getElapsed()).toBeGreaterThanOrEqual(50);
    });

    it('should detect expired state', () => {
      const timer = new ExecutionTimer(0);

      expect(timer.isExpired()).toBe(true);
    });

    it('should calculate remaining time', () => {
      const timer = new ExecutionTimer(1000);

      expect(timer.getRemaining()).toBeGreaterThan(0);
      expect(timer.getRemaining()).toBeLessThanOrEqual(1000);
    });

    it('should return undefined remaining time when no timeout', () => {
      const timer = new ExecutionTimer();

      expect(timer.getRemaining()).toBeUndefined();
    });

    it('should detect approaching timeout', async () => {
      const timer = new ExecutionTimer(100);

      expect(timer.isApproachingTimeout()).toBe(false);

      await new Promise((r) => setTimeout(r, 85));

      expect(timer.isApproachingTimeout()).toBe(true);
    });

    it('should record checkpoints', () => {
      const timer = new ExecutionTimer();

      timer.checkpoint('start');
      timer.checkpoint('middle');
      timer.checkpoint('end');

      const checkpoints = timer.getCheckpoints();
      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0].name).toBe('start');
      expect(checkpoints[1].name).toBe('middle');
      expect(checkpoints[2].name).toBe('end');
    });

    it('should provide summary', () => {
      const timer = new ExecutionTimer(1000);
      timer.checkpoint('test');

      const summary = timer.getSummary();

      expect(summary.elapsed).toBeGreaterThanOrEqual(0);
      expect(summary.remaining).toBeDefined();
      expect(summary.expired).toBe(false);
      expect(summary.checkpoints).toHaveLength(1);
    });
  });

  describe('Deadline utilities', () => {
    it('should create deadline in the future', () => {
      const deadline = createDeadline(1000);
      const now = new Date();

      expect(deadline.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should detect passed deadline', async () => {
      const deadline = createDeadline(50);

      expect(isDeadlinePassed(deadline)).toBe(false);

      await new Promise((r) => setTimeout(r, 60));

      expect(isDeadlinePassed(deadline)).toBe(true);
    });

    it('should calculate remaining time', () => {
      const deadline = createDeadline(1000);

      const remaining = getRemainingTime(deadline);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(1000);
    });

    it('should return 0 for passed deadline', async () => {
      const deadline = createDeadline(10);

      await new Promise((r) => setTimeout(r, 20));

      expect(getRemainingTime(deadline)).toBe(0);
    });
  });

  describe('raceWithTimeout', () => {
    it('should return result when promise resolves in time', async () => {
      const promise = Promise.resolve('success');

      const result = await raceWithTimeout(promise, 1000);

      expect(result).toBe('success');
    });

    it('should throw TimeoutError when timeout occurs first', async () => {
      const promise = new Promise((r) => setTimeout(() => r('success'), 200));

      await expect(raceWithTimeout(promise, 50)).rejects.toThrow(TimeoutError);
    });

    it('should include custom message in TimeoutError', async () => {
      const promise = new Promise((r) => setTimeout(() => r('success'), 200));

      try {
        await raceWithTimeout(promise, 50, 'Custom timeout message');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).message).toBe('Custom timeout message');
      }
    });
  });
});
