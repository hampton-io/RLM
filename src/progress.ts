/**
 * Progress tracking and callbacks for RLM execution.
 *
 * Provides event-based progress updates, webhooks, and
 * execution monitoring capabilities.
 */

import type { RLMStreamEvent } from './types.js';

/**
 * Progress event types.
 */
export type ProgressEventType =
  | 'execution:start'
  | 'execution:iteration'
  | 'execution:code'
  | 'execution:output'
  | 'execution:subquery'
  | 'execution:complete'
  | 'execution:error'
  | 'tokens:update'
  | 'cost:update';

/**
 * Progress event data.
 */
export interface ProgressEvent {
  /** Event type */
  type: ProgressEventType;
  /** Timestamp */
  timestamp: number;
  /** Event data */
  data: ProgressEventData;
}

/**
 * Event-specific data types.
 */
export type ProgressEventData =
  | ExecutionStartData
  | ExecutionIterationData
  | ExecutionCodeData
  | ExecutionOutputData
  | ExecutionSubqueryData
  | ExecutionCompleteData
  | ExecutionErrorData
  | TokensUpdateData
  | CostUpdateData;

export interface ExecutionStartData {
  type: 'execution:start';
  query: string;
  contextLength: number;
  model: string;
  maxIterations: number;
}

export interface ExecutionIterationData {
  type: 'execution:iteration';
  iteration: number;
  maxIterations: number;
  depth: number;
}

export interface ExecutionCodeData {
  type: 'execution:code';
  iteration: number;
  code: string;
  codeLength: number;
}

export interface ExecutionOutputData {
  type: 'execution:output';
  iteration: number;
  output: string;
  error?: string;
  executionTime: number;
}

export interface ExecutionSubqueryData {
  type: 'execution:subquery';
  prompt: string;
  contextLength: number;
  depth: number;
}

export interface ExecutionCompleteData {
  type: 'execution:complete';
  response: string;
  iterations: number;
  totalTime: number;
  method: 'FINAL' | 'FINAL_VAR';
}

export interface ExecutionErrorData {
  type: 'execution:error';
  error: string;
  iteration?: number;
  recoverable: boolean;
}

export interface TokensUpdateData {
  type: 'tokens:update';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  iteration: number;
}

export interface CostUpdateData {
  type: 'cost:update';
  currentCost: number;
  iteration: number;
  model: string;
}

/**
 * Progress callback function type.
 */
export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;

/**
 * Webhook configuration.
 */
export interface WebhookConfig {
  /** Webhook URL */
  url: string;
  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT';
  /** Custom headers */
  headers?: Record<string, string>;
  /** Events to send (default: all) */
  events?: ProgressEventType[];
  /** Batch events (default: false) */
  batch?: boolean;
  /** Batch interval in ms (default: 1000) */
  batchInterval?: number;
  /** Retry failed webhooks (default: true) */
  retry?: boolean;
  /** Max retries (default: 3) */
  maxRetries?: number;
  /** Timeout in ms (default: 5000) */
  timeout?: number;
}

/**
 * Progress tracker for RLM execution.
 *
 * @example
 * ```typescript
 * const tracker = new ProgressTracker();
 *
 * // Subscribe to events
 * tracker.on('execution:iteration', (event) => {
 *   console.log(`Iteration ${event.data.iteration}/${event.data.maxIterations}`);
 * });
 *
 * tracker.on('tokens:update', (event) => {
 *   console.log(`Tokens: ${event.data.totalTokens}`);
 * });
 *
 * // Or use a wildcard
 * tracker.onAll((event) => {
 *   console.log(event.type, event.data);
 * });
 * ```
 */
export class ProgressTracker {
  private listeners = new Map<ProgressEventType | '*', Set<ProgressCallback>>();
  private eventHistory: ProgressEvent[] = [];
  private maxHistorySize: number;

  constructor(options: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 1000;
  }

  /**
   * Subscribe to a specific event type.
   */
  on(type: ProgressEventType, callback: ProgressCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  /**
   * Subscribe to all events.
   */
  onAll(callback: ProgressCallback): () => void {
    if (!this.listeners.has('*')) {
      this.listeners.set('*', new Set());
    }
    this.listeners.get('*')!.add(callback);

    return () => {
      this.listeners.get('*')?.delete(callback);
    };
  }

  /**
   * Unsubscribe from an event type.
   */
  off(type: ProgressEventType, callback: ProgressCallback): void {
    this.listeners.get(type)?.delete(callback);
  }

  /**
   * Emit a progress event.
   */
  async emit(type: ProgressEventType, data: Omit<ProgressEventData, 'type'>): Promise<void> {
    const event: ProgressEvent = {
      type,
      timestamp: Date.now(),
      data: { ...data, type } as ProgressEventData,
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify specific listeners
    const specificListeners = this.listeners.get(type);
    if (specificListeners) {
      for (const callback of specificListeners) {
        await callback(event);
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const callback of wildcardListeners) {
        await callback(event);
      }
    }
  }

  /**
   * Get event history.
   */
  getHistory(): ProgressEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get summary of execution.
   */
  getSummary(): {
    totalIterations: number;
    totalTokens: number;
    totalCost: number;
    errors: number;
    duration: number;
  } {
    let totalIterations = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let errors = 0;
    let startTime: number | null = null;
    let endTime: number | null = null;

    for (const event of this.eventHistory) {
      if (event.type === 'execution:start' && !startTime) {
        startTime = event.timestamp;
      }
      if (event.type === 'execution:complete') {
        endTime = event.timestamp;
        const data = event.data as ExecutionCompleteData;
        totalIterations = data.iterations;
      }
      if (event.type === 'tokens:update') {
        const data = event.data as TokensUpdateData;
        totalTokens = data.totalTokens;
      }
      if (event.type === 'cost:update') {
        const data = event.data as CostUpdateData;
        totalCost = data.currentCost;
      }
      if (event.type === 'execution:error') {
        errors++;
      }
    }

    return {
      totalIterations,
      totalTokens,
      totalCost,
      errors,
      duration: startTime && endTime ? endTime - startTime : 0,
    };
  }
}

/**
 * Webhook sender for progress events.
 */
export class WebhookSender {
  private config: Required<WebhookConfig>;
  private eventBatch: ProgressEvent[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WebhookConfig) {
    this.config = {
      url: config.url,
      method: config.method ?? 'POST',
      headers: config.headers ?? {},
      events: config.events ?? [],
      batch: config.batch ?? false,
      batchInterval: config.batchInterval ?? 1000,
      retry: config.retry ?? true,
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 5000,
    };
  }

  /**
   * Send an event to the webhook.
   */
  async send(event: ProgressEvent): Promise<void> {
    // Filter events if specified
    if (this.config.events.length > 0 && !this.config.events.includes(event.type)) {
      return;
    }

    if (this.config.batch) {
      this.eventBatch.push(event);
      this.scheduleBatchSend();
    } else {
      await this.sendEvents([event]);
    }
  }

  /**
   * Schedule a batch send.
   */
  private scheduleBatchSend(): void {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(async () => {
      this.batchTimeout = null;
      if (this.eventBatch.length > 0) {
        const events = [...this.eventBatch];
        this.eventBatch = [];
        await this.sendEvents(events);
      }
    }, this.config.batchInterval);
  }

  /**
   * Send events to webhook.
   */
  private async sendEvents(events: ProgressEvent[]): Promise<void> {
    const body = JSON.stringify(events.length === 1 ? events[0] : { events });

    for (let attempt = 0; attempt <= (this.config.retry ? this.config.maxRetries : 0); attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(this.config.url, {
          method: this.config.method,
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers,
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return;
        }

        // Don't retry on client errors
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        if (attempt === (this.config.retry ? this.config.maxRetries : 0)) {
          // Log error but don't throw - webhooks shouldn't block execution
          console.error('Webhook failed:', error);
        } else {
          // Wait before retry
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
  }

  /**
   * Flush any pending batched events.
   */
  async flush(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.eventBatch.length > 0) {
      const events = [...this.eventBatch];
      this.eventBatch = [];
      await this.sendEvents(events);
    }
  }
}

/**
 * Create a progress tracker with webhook support.
 */
export function createProgressTracker(options?: {
  webhooks?: WebhookConfig[];
  maxHistorySize?: number;
}): ProgressTracker {
  const tracker = new ProgressTracker({ maxHistorySize: options?.maxHistorySize });

  if (options?.webhooks) {
    for (const config of options.webhooks) {
      const sender = new WebhookSender(config);
      tracker.onAll((event) => sender.send(event));
    }
  }

  return tracker;
}

/**
 * Convert RLM stream events to progress events.
 */
export function streamToProgress(
  tracker: ProgressTracker,
  options: { model: string; maxIterations: number }
): (event: RLMStreamEvent) => Promise<void> {
  let currentIteration = 0;
  let totalTokens = 0;
  let totalCost = 0;

  return async (event: RLMStreamEvent) => {
    switch (event.type) {
      case 'start':
        await tracker.emit('execution:start', {
          query: '',
          contextLength: 0,
          model: options.model,
          maxIterations: options.maxIterations,
        });
        break;

      case 'code':
        currentIteration = event.data.iteration;
        await tracker.emit('execution:iteration', {
          iteration: currentIteration,
          maxIterations: options.maxIterations,
          depth: 0,
        });
        await tracker.emit('execution:code', {
          iteration: currentIteration,
          code: event.data.code,
          codeLength: event.data.code.length,
        });
        break;

      case 'code_output':
        await tracker.emit('execution:output', {
          iteration: event.data.iteration,
          output: event.data.output,
          error: event.data.error,
          executionTime: 0,
        });
        break;

      case 'sub_query':
        await tracker.emit('execution:subquery', {
          prompt: event.data.prompt,
          contextLength: event.data.contextLength,
          depth: event.data.depth,
        });
        break;

      case 'final':
        await tracker.emit('execution:complete', {
          response: event.data.response,
          iterations: currentIteration,
          totalTime: 0,
          method: event.data.method,
        });
        break;

      case 'error':
        await tracker.emit('execution:error', {
          error: event.data.message,
          iteration: currentIteration,
          recoverable: false,
        });
        break;

      case 'done':
        totalTokens = event.data.usage.totalTokens;
        totalCost = event.data.usage.estimatedCost;
        await tracker.emit('tokens:update', {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens,
          iteration: currentIteration,
        });
        await tracker.emit('cost:update', {
          currentCost: totalCost,
          iteration: currentIteration,
          model: options.model,
        });
        break;
    }
  };
}

/**
 * Progress bar helper for CLI.
 */
export function createProgressBar(options: { total: number; width?: number; format?: string }): {
  update: (current: number, extra?: Record<string, unknown>) => string;
  complete: () => string;
} {
  const { total, width = 40, format = '[:bar] :percent% | :current/:total' } = options;

  const update = (current: number, extra: Record<string, unknown> = {}): string => {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const bar = '='.repeat(filled) + '-'.repeat(width - filled);

    let output = format
      .replace(':bar', bar)
      .replace(':percent', String(percent))
      .replace(':current', String(current))
      .replace(':total', String(total));

    for (const [key, value] of Object.entries(extra)) {
      output = output.replace(`:${key}`, String(value));
    }

    return output;
  };

  const complete = (): string => {
    return update(total);
  };

  return { update, complete };
}
