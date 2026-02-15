import type { QueryMetric } from './collector.js';

export interface MetricsFilter {
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
  model?: string;
  success?: boolean;
  minCost?: number;
  maxCost?: number;
  tags?: string[];
  instanceId?: string;
  queryContains?: string;
  orderBy?: 'timestamp' | 'cost' | 'duration';
  orderDirection?: 'asc' | 'desc';
}

export interface RetentionPolicy {
  maxQueries?: number;
  retentionDays?: number;
}

export interface StoreHealthResult {
  healthy: boolean;
  latencyMs: number;
  details?: string;
}

export interface MetricsStoreStats {
  queries: number;
  cost: number;
  avgDuration: number;
  errorRate: number;
  byModel: Record<string, { queries: number; cost: number }>;
}

export interface MetricsStore {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<StoreHealthResult>;
  record(metric: QueryMetric): Promise<void>;
  getById(id: string): Promise<QueryMetric | undefined>;
  query(filter: MetricsFilter): Promise<{ metrics: QueryMetric[]; total: number }>;
  getStats(periodMs: number): Promise<MetricsStoreStats>;
  clear(): Promise<void>;
  prune(policy: RetentionPolicy): Promise<number>;
  export(): Promise<QueryMetric[]>;
}
