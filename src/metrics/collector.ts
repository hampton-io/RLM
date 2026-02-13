/**
 * RLM Metrics Collector
 * Collects and stores query metrics for observability
 */

export interface QueryMetric {
  id: string;
  timestamp: Date;
  query: string;
  queryHash?: string; // SHA256 if redacted
  contextBytes: number;
  model: string;
  iterations: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durationMs: number;
  success: boolean;
  error?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricsConfig {
  enabled: boolean;
  redactQueries?: boolean;
  maxHistory?: number; // Max queries to keep in memory
  apiKey?: string;
}

class MetricsCollector {
  private queries: QueryMetric[] = [];
  private config: MetricsConfig = { enabled: false };
  private startTime: Date = new Date();

  configure(config: MetricsConfig): void {
    this.config = config;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  record(metric: Omit<QueryMetric, "id" | "timestamp">): QueryMetric {
    if (!this.config.enabled) {
      return { ...metric, id: "", timestamp: new Date() };
    }

    const fullMetric: QueryMetric = {
      ...metric,
      id: this.generateId(),
      timestamp: new Date(),
    };

    // Optionally redact query text
    if (this.config.redactQueries) {
      fullMetric.queryHash = this.hashQuery(fullMetric.query);
      fullMetric.query = "[REDACTED]";
    }

    this.queries.unshift(fullMetric);

    // Trim history if needed
    const maxHistory = this.config.maxHistory || 10000;
    if (this.queries.length > maxHistory) {
      this.queries = this.queries.slice(0, maxHistory);
    }

    return fullMetric;
  }

  getQueries(options?: {
    limit?: number;
    offset?: number;
    since?: Date;
    model?: string;
    success?: boolean;
  }): { queries: QueryMetric[]; total: number } {
    let filtered = [...this.queries];

    if (options?.since) {
      filtered = filtered.filter((q) => q.timestamp >= options.since!);
    }
    if (options?.model) {
      filtered = filtered.filter((q) => q.model === options.model);
    }
    if (options?.success !== undefined) {
      filtered = filtered.filter((q) => q.success === options.success);
    }

    const total = filtered.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    return {
      queries: filtered.slice(offset, offset + limit),
      total,
    };
  }

  getQuery(id: string): QueryMetric | undefined {
    return this.queries.find((q) => q.id === id);
  }

  getStats(period: "hour" | "day" | "week" | "month" = "day"): {
    queries: number;
    cost: number;
    avgDuration: number;
    errorRate: number;
    byModel: Record<string, { queries: number; cost: number }>;
  } {
    const now = new Date();
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }[period];

    const cutoff = new Date(now.getTime() - periodMs);
    const periodQueries = this.queries.filter((q) => q.timestamp >= cutoff);

    const totalCost = periodQueries.reduce((sum, q) => sum + q.cost, 0);
    const totalDuration = periodQueries.reduce((sum, q) => sum + q.durationMs, 0);
    const errors = periodQueries.filter((q) => !q.success).length;

    const byModel: Record<string, { queries: number; cost: number }> = {};
    for (const q of periodQueries) {
      if (!byModel[q.model]) {
        byModel[q.model] = { queries: 0, cost: 0 };
      }
      byModel[q.model].queries++;
      byModel[q.model].cost += q.cost;
    }

    return {
      queries: periodQueries.length,
      cost: totalCost,
      avgDuration: periodQueries.length > 0 ? totalDuration / periodQueries.length : 0,
      errorRate: periodQueries.length > 0 ? errors / periodQueries.length : 0,
      byModel,
    };
  }

  getHealth(): {
    status: "healthy" | "degraded" | "unhealthy";
    uptime: number;
    activeQueries: number;
    lastQuery?: Date;
    totalQueries: number;
  } {
    const stats = this.getStats("hour");
    const uptime = Date.now() - this.startTime.getTime();

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (stats.errorRate > 0.1) status = "degraded";
    if (stats.errorRate > 0.5) status = "unhealthy";

    return {
      status,
      uptime,
      activeQueries: 0, // Could track active queries if needed
      lastQuery: this.queries[0]?.timestamp,
      totalQueries: this.queries.length,
    };
  }

  clear(): void {
    this.queries = [];
  }

  private generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private hashQuery(query: string): string {
    // Simple hash for demo - use crypto.subtle.digest in production
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
