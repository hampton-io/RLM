import type { TokenUsage } from './types.js';
import { calculateCost } from './clients/types.js';
import { RLMError } from './types.js';

/**
 * Error thrown when budget limit is exceeded.
 */
export class BudgetExceededError extends RLMError {
  constructor(
    public currentCost: number,
    public maxCost: number
  ) {
    super(
      `Budget exceeded: $${currentCost.toFixed(4)} spent, limit is $${maxCost.toFixed(4)}`,
      'MAX_ITERATIONS' // Using existing error code
    );
    this.name = 'BudgetExceededError';
  }
}

/**
 * Error thrown when token limit is exceeded.
 */
export class TokenLimitExceededError extends RLMError {
  constructor(
    public currentTokens: number,
    public maxTokens: number
  ) {
    super(
      `Token limit exceeded: ${currentTokens.toLocaleString()} tokens used, limit is ${maxTokens.toLocaleString()}`,
      'MAX_ITERATIONS' // Using existing error code
    );
    this.name = 'TokenLimitExceededError';
  }
}

/**
 * Tracks costs and enforces budget limits during RLM execution.
 */
export class CostTracker {
  private model: string;
  private maxCost?: number;
  private maxTokens?: number;

  private totalCost = 0;
  private totalTokens = 0;
  private callCount = 0;
  private usageHistory: Array<{
    timestamp: number;
    usage: TokenUsage;
    cost: number;
    depth: number;
  }> = [];

  constructor(options: { model: string; maxCost?: number; maxTokens?: number }) {
    this.model = options.model;
    this.maxCost = options.maxCost;
    this.maxTokens = options.maxTokens;
  }

  /**
   * Record usage from an LLM call and check limits.
   * Throws if limits are exceeded.
   */
  recordUsage(usage: TokenUsage, depth: number = 0): void {
    const cost = calculateCost(this.model, usage);

    this.totalCost += cost;
    this.totalTokens += usage.totalTokens;
    this.callCount++;

    this.usageHistory.push({
      timestamp: Date.now(),
      usage,
      cost,
      depth,
    });

    // Check limits
    this.checkLimits();
  }

  /**
   * Check if current usage exceeds limits.
   * Throws if limits are exceeded.
   */
  checkLimits(): void {
    if (this.maxCost !== undefined && this.totalCost > this.maxCost) {
      throw new BudgetExceededError(this.totalCost, this.maxCost);
    }

    if (this.maxTokens !== undefined && this.totalTokens > this.maxTokens) {
      throw new TokenLimitExceededError(this.totalTokens, this.maxTokens);
    }
  }

  /**
   * Check if we're approaching limits (>80% used).
   */
  isApproachingLimits(): { cost: boolean; tokens: boolean } {
    return {
      cost: this.maxCost !== undefined && this.totalCost > this.maxCost * 0.8,
      tokens: this.maxTokens !== undefined && this.totalTokens > this.maxTokens * 0.8,
    };
  }

  /**
   * Get remaining budget.
   */
  getRemainingBudget(): { cost?: number; tokens?: number } {
    return {
      cost: this.maxCost !== undefined ? Math.max(0, this.maxCost - this.totalCost) : undefined,
      tokens:
        this.maxTokens !== undefined ? Math.max(0, this.maxTokens - this.totalTokens) : undefined,
    };
  }

  /**
   * Get current totals.
   */
  getTotals(): {
    totalCost: number;
    totalTokens: number;
    callCount: number;
    promptTokens: number;
    completionTokens: number;
  } {
    const promptTokens = this.usageHistory.reduce((sum, h) => sum + h.usage.promptTokens, 0);
    const completionTokens = this.usageHistory.reduce(
      (sum, h) => sum + h.usage.completionTokens,
      0
    );

    return {
      totalCost: this.totalCost,
      totalTokens: this.totalTokens,
      callCount: this.callCount,
      promptTokens,
      completionTokens,
    };
  }

  /**
   * Get usage breakdown by depth level.
   */
  getUsageByDepth(): Map<number, { cost: number; tokens: number; calls: number }> {
    const byDepth = new Map<number, { cost: number; tokens: number; calls: number }>();

    for (const entry of this.usageHistory) {
      const current = byDepth.get(entry.depth) ?? { cost: 0, tokens: 0, calls: 0 };
      current.cost += entry.cost;
      current.tokens += entry.usage.totalTokens;
      current.calls += 1;
      byDepth.set(entry.depth, current);
    }

    return byDepth;
  }

  /**
   * Get a formatted summary of usage.
   */
  getSummary(): string {
    const totals = this.getTotals();
    const lines = [
      `Total Cost: $${totals.totalCost.toFixed(4)}`,
      `Total Tokens: ${totals.totalTokens.toLocaleString()}`,
      `  - Prompt: ${totals.promptTokens.toLocaleString()}`,
      `  - Completion: ${totals.completionTokens.toLocaleString()}`,
      `API Calls: ${totals.callCount}`,
    ];

    if (this.maxCost !== undefined) {
      const remaining = this.getRemainingBudget().cost!;
      lines.push(`Budget Remaining: $${remaining.toFixed(4)} of $${this.maxCost.toFixed(4)}`);
    }

    if (this.maxTokens !== undefined) {
      const remaining = this.getRemainingBudget().tokens!;
      lines.push(
        `Tokens Remaining: ${remaining.toLocaleString()} of ${this.maxTokens.toLocaleString()}`
      );
    }

    const byDepth = this.getUsageByDepth();
    if (byDepth.size > 1) {
      lines.push('\nUsage by Depth:');
      for (const [depth, usage] of byDepth) {
        lines.push(
          `  Depth ${depth}: ${usage.calls} calls, $${usage.cost.toFixed(4)}, ${usage.tokens.toLocaleString()} tokens`
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset the tracker.
   */
  reset(): void {
    this.totalCost = 0;
    this.totalTokens = 0;
    this.callCount = 0;
    this.usageHistory = [];
  }
}
