import type { QueryMetric } from '../collector.js';
import type {
  MetricsStore,
  MetricsFilter,
  MetricsStoreStats,
  RetentionPolicy,
  StoreHealthResult,
} from '../types.js';

export class InMemoryStore implements MetricsStore {
  readonly name = 'memory';
  private metrics: QueryMetric[] = [];

  async connect(): Promise<void> {
    // No-op for in-memory store
  }

  async disconnect(): Promise<void> {
    // No-op for in-memory store
  }

  async healthCheck(): Promise<StoreHealthResult> {
    const start = Date.now();
    return { healthy: true, latencyMs: Date.now() - start };
  }

  async record(metric: QueryMetric): Promise<void> {
    this.metrics.unshift(metric);
  }

  async getById(id: string): Promise<QueryMetric | undefined> {
    return this.metrics.find((m) => m.id === id);
  }

  async query(filter: MetricsFilter): Promise<{ metrics: QueryMetric[]; total: number }> {
    let filtered = this.applyFilters(this.metrics, filter);
    filtered = this.applySort(filtered, filter);

    const total = filtered.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;

    return {
      metrics: filtered.slice(offset, offset + limit),
      total,
    };
  }

  async getStats(periodMs: number): Promise<MetricsStoreStats> {
    const cutoff = new Date(Date.now() - periodMs);
    const periodMetrics = this.metrics.filter((m) => m.timestamp >= cutoff);

    const totalCost = periodMetrics.reduce((sum, m) => sum + m.cost, 0);
    const totalDuration = periodMetrics.reduce((sum, m) => sum + m.durationMs, 0);
    const errors = periodMetrics.filter((m) => !m.success).length;

    const byModel: Record<string, { queries: number; cost: number }> = {};
    for (const m of periodMetrics) {
      if (!byModel[m.model]) {
        byModel[m.model] = { queries: 0, cost: 0 };
      }
      byModel[m.model].queries++;
      byModel[m.model].cost += m.cost;
    }

    return {
      queries: periodMetrics.length,
      cost: totalCost,
      avgDuration: periodMetrics.length > 0 ? totalDuration / periodMetrics.length : 0,
      errorRate: periodMetrics.length > 0 ? errors / periodMetrics.length : 0,
      byModel,
    };
  }

  async clear(): Promise<void> {
    this.metrics = [];
  }

  async prune(policy: RetentionPolicy): Promise<number> {
    const originalLength = this.metrics.length;
    let pruned = 0;

    if (policy.retentionDays !== undefined) {
      const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
      this.metrics = this.metrics.filter((m) => m.timestamp >= cutoff);
      pruned += originalLength - this.metrics.length;
    }

    if (policy.maxQueries !== undefined && this.metrics.length > policy.maxQueries) {
      const excess = this.metrics.length - policy.maxQueries;
      this.metrics = this.metrics.slice(0, policy.maxQueries);
      pruned += excess;
    }

    return pruned;
  }

  async export(): Promise<QueryMetric[]> {
    return [...this.metrics];
  }

  private applyFilters(metrics: QueryMetric[], filter: MetricsFilter): QueryMetric[] {
    let result = [...metrics];

    if (filter.since) {
      result = result.filter((m) => m.timestamp >= filter.since!);
    }
    if (filter.until) {
      result = result.filter((m) => m.timestamp <= filter.until!);
    }
    if (filter.model) {
      result = result.filter((m) => m.model === filter.model);
    }
    if (filter.success !== undefined) {
      result = result.filter((m) => m.success === filter.success);
    }
    if (filter.minCost !== undefined) {
      result = result.filter((m) => m.cost >= filter.minCost!);
    }
    if (filter.maxCost !== undefined) {
      result = result.filter((m) => m.cost <= filter.maxCost!);
    }
    if (filter.instanceId) {
      result = result.filter((m) => m.instanceId === filter.instanceId);
    }
    if (filter.queryContains) {
      const search = filter.queryContains.toLowerCase();
      result = result.filter((m) => m.query.toLowerCase().includes(search));
    }
    if (filter.tags && filter.tags.length > 0) {
      result = result.filter((m) => m.tags && filter.tags!.some((t) => m.tags!.includes(t)));
    }

    return result;
  }

  private applySort(metrics: QueryMetric[], filter: MetricsFilter): QueryMetric[] {
    if (!filter.orderBy) return metrics;

    const dir = filter.orderDirection === 'asc' ? 1 : -1;
    return [...metrics].sort((a, b) => {
      switch (filter.orderBy) {
        case 'timestamp':
          return dir * (a.timestamp.getTime() - b.timestamp.getTime());
        case 'cost':
          return dir * (a.cost - b.cost);
        case 'duration':
          return dir * (a.durationMs - b.durationMs);
        default:
          return 0;
      }
    });
  }
}
