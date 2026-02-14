/**
 * RLM Metrics Collector
 * Collects and stores query metrics for observability
 * Supports file-based persistence for sharing between processes
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
  storagePath?: string; // Path to JSON file for persistence
}

interface StoredMetric extends Omit<QueryMetric, "timestamp"> {
  timestamp: string; // ISO string for JSON serialization
}

class MetricsCollector {
  private queries: QueryMetric[] = [];
  private config: MetricsConfig = { enabled: false };
  private startTime: Date = new Date();
  private loaded = false;

  configure(config: MetricsConfig): void {
    this.config = config;
    
    // Load existing metrics from file if configured
    if (config.storagePath && !this.loaded) {
      this.loadFromFile();
      this.loaded = true;
    }
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

    // Reload from file to get latest (in case another process wrote)
    if (this.config.storagePath) {
      this.loadFromFile();
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

    // Save to file if configured
    if (this.config.storagePath) {
      this.saveToFile();
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
    // Reload from file to get latest
    if (this.config.storagePath) {
      this.loadFromFile();
    }

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
    if (this.config.storagePath) {
      this.loadFromFile();
    }
    return this.queries.find((q) => q.id === id);
  }

  getStats(period: "hour" | "day" | "week" | "month" = "day"): {
    queries: number;
    cost: number;
    avgDuration: number;
    errorRate: number;
    byModel: Record<string, { queries: number; cost: number }>;
  } {
    if (this.config.storagePath) {
      this.loadFromFile();
    }

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
    if (this.config.storagePath) {
      this.loadFromFile();
    }

    const stats = this.getStats("hour");
    const uptime = Date.now() - this.startTime.getTime();

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (stats.errorRate > 0.1) status = "degraded";
    if (stats.errorRate > 0.5) status = "unhealthy";

    return {
      status,
      uptime,
      activeQueries: 0,
      lastQuery: this.queries[0]?.timestamp,
      totalQueries: this.queries.length,
    };
  }

  clear(): void {
    this.queries = [];
    if (this.config.storagePath) {
      this.saveToFile();
    }
  }

  private loadFromFile(): void {
    if (!this.config.storagePath) return;

    try {
      if (existsSync(this.config.storagePath)) {
        const data = readFileSync(this.config.storagePath, "utf8");
        const stored: StoredMetric[] = JSON.parse(data);
        this.queries = stored.map((m) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
      }
    } catch (error) {
      console.error("Failed to load metrics from file:", error);
    }
  }

  private saveToFile(): void {
    if (!this.config.storagePath) return;

    try {
      // Ensure directory exists
      const dir = dirname(this.config.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const stored: StoredMetric[] = this.queries.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }));
      writeFileSync(this.config.storagePath, JSON.stringify(stored, null, 2));
    } catch (error) {
      console.error("Failed to save metrics to file:", error);
    }
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
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();
