import type {
  MetricsStore,
  MetricsFilter,
  MetricsStoreStats,
  RetentionPolicy,
  StoreHealthResult,
} from './types.js';
import { createMetricsStore } from './stores/index.js';
import type { MetricsStoreConfig } from './stores/index.js';

export interface QueryMetric {
  id: string;
  timestamp: Date;
  query: string;
  queryHash?: string;
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
  tags?: string[];
  instanceId?: string;
}

export interface MetricsConfig {
  enabled: boolean;
  redactQueries?: boolean;
  maxHistory?: number;
  apiKey?: string;
  storagePath?: string;
  store?: MetricsStore;
}

class MetricsCollector {
  private store: MetricsStore | null = null;
  private config: MetricsConfig = { enabled: false };
  private startTime: Date = new Date();
  async configure(config: MetricsConfig): Promise<void> {
    this.config = config;

    if (this.store) {
      await this.store.disconnect();
      this.store = null;
    }

    if (config.enabled) {
      const storeConfig: MetricsStoreConfig = {
        store: config.store,
        storagePath: config.storagePath,
      };
      this.store = await createMetricsStore(storeConfig);
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  async record(metric: Omit<QueryMetric, 'id' | 'timestamp'>): Promise<QueryMetric> {
    if (!this.config.enabled || !this.store) {
      return { ...metric, id: '', timestamp: new Date() };
    }

    const fullMetric: QueryMetric = {
      ...metric,
      id: this.generateId(),
      timestamp: new Date(),
    };

    if (this.config.redactQueries) {
      fullMetric.queryHash = this.hashQuery(fullMetric.query);
      fullMetric.query = '[REDACTED]';
    }

    await this.store.record(fullMetric);

    // Trim history if needed
    const maxHistory = this.config.maxHistory || 10000;
    await this.store.prune({ maxQueries: maxHistory });

    return fullMetric;
  }

  async getQueries(options?: {
    limit?: number;
    offset?: number;
    since?: Date;
    model?: string;
    success?: boolean;
  }): Promise<{ queries: QueryMetric[]; total: number }> {
    if (!this.store) {
      return { queries: [], total: 0 };
    }

    const filter: MetricsFilter = {
      limit: options?.limit,
      offset: options?.offset,
      since: options?.since,
      model: options?.model,
      success: options?.success,
    };

    const result = await this.store.query(filter);
    return { queries: result.metrics, total: result.total };
  }

  async getQuery(id: string): Promise<QueryMetric | undefined> {
    if (!this.store) return undefined;
    return this.store.getById(id);
  }

  async getStats(period: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<MetricsStoreStats> {
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }[period];

    if (!this.store) {
      return { queries: 0, cost: 0, avgDuration: 0, errorRate: 0, byModel: {} };
    }

    return this.store.getStats(periodMs);
  }

  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    activeQueries: number;
    lastQuery?: Date;
    totalQueries: number;
    store?: StoreHealthResult;
  }> {
    const stats = await this.getStats('hour');
    const uptime = Date.now() - this.startTime.getTime();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (stats.errorRate > 0.1) status = 'degraded';
    if (stats.errorRate > 0.5) status = 'unhealthy';

    let storeHealth: StoreHealthResult | undefined;
    let totalQueries = 0;
    let lastQuery: Date | undefined;

    if (this.store) {
      storeHealth = await this.store.healthCheck();
      const allMetrics = await this.store.query({ limit: 1 });
      totalQueries = allMetrics.total;
      if (allMetrics.metrics.length > 0) {
        lastQuery = allMetrics.metrics[0].timestamp;
      }
    }

    return {
      status,
      uptime,
      activeQueries: 0,
      lastQuery,
      totalQueries,
      store: storeHealth,
    };
  }

  async clear(): Promise<void> {
    if (this.store) {
      await this.store.clear();
    }
  }

  async prune(policy: RetentionPolicy): Promise<number> {
    if (!this.store) return 0;
    return this.store.prune(policy);
  }

  async export(): Promise<QueryMetric[]> {
    if (!this.store) return [];
    return this.store.export();
  }

  getStore(): MetricsStore | null {
    return this.store;
  }

  private generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private hashQuery(query: string): string {
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
