import type BetterSqlite3 from 'better-sqlite3';
import type { QueryMetric } from '../collector.js';
import type {
  MetricsStore,
  MetricsFilter,
  MetricsStoreStats,
  RetentionPolicy,
  StoreHealthResult,
} from '../types.js';

export class SqliteStore implements MetricsStore {
  readonly name = 'sqlite';
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async connect(): Promise<void> {
    let Database: typeof BetterSqlite3;
    try {
      const mod = await import('better-sqlite3');
      Database = (mod.default ?? mod) as typeof BetterSqlite3;
    } catch {
      throw new Error(
        'better-sqlite3 is required for the SQLite metrics store. ' +
          'Install it with: npm install better-sqlite3'
      );
    }

    this.db = new Database(this.dbPath);

    // Enable WAL mode for concurrent reads
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        query TEXT NOT NULL,
        query_hash TEXT,
        context_bytes INTEGER NOT NULL,
        model TEXT NOT NULL,
        iterations INTEGER NOT NULL,
        tokens_in INTEGER NOT NULL,
        tokens_out INTEGER NOT NULL,
        cost REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        success INTEGER NOT NULL,
        error TEXT,
        user_id TEXT,
        metadata TEXT,
        tags TEXT,
        instance_id TEXT
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_model ON metrics(model);
      CREATE INDEX IF NOT EXISTS idx_metrics_success ON metrics(success);
      CREATE INDEX IF NOT EXISTS idx_metrics_instance_id ON metrics(instance_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_cost ON metrics(cost);
    `);
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async healthCheck(): Promise<StoreHealthResult> {
    const start = Date.now();
    try {
      if (!this.db) {
        return { healthy: false, latencyMs: 0, details: 'Database not connected' };
      }
      this.db.prepare('SELECT 1').get();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async record(metric: QueryMetric): Promise<void> {
    this.ensureConnected();
    this.db!.prepare(
      `
      INSERT INTO metrics (id, timestamp, query, query_hash, context_bytes, model, iterations,
        tokens_in, tokens_out, cost, duration_ms, success, error, user_id, metadata, tags, instance_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      metric.id,
      metric.timestamp.toISOString(),
      metric.query,
      metric.queryHash ?? null,
      metric.contextBytes,
      metric.model,
      metric.iterations,
      metric.tokensIn,
      metric.tokensOut,
      metric.cost,
      metric.durationMs,
      metric.success ? 1 : 0,
      metric.error ?? null,
      metric.userId ?? null,
      metric.metadata ? JSON.stringify(metric.metadata) : null,
      metric.tags ? JSON.stringify(metric.tags) : null,
      metric.instanceId ?? null
    );
  }

  async recordBatch(metrics: QueryMetric[]): Promise<void> {
    this.ensureConnected();
    const insert = this.db!.prepare(`
      INSERT INTO metrics (id, timestamp, query, query_hash, context_bytes, model, iterations,
        tokens_in, tokens_out, cost, duration_ms, success, error, user_id, metadata, tags, instance_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db!.transaction(() => {
      for (const m of metrics) {
        insert.run(
          m.id,
          m.timestamp.toISOString(),
          m.query,
          m.queryHash ?? null,
          m.contextBytes,
          m.model,
          m.iterations,
          m.tokensIn,
          m.tokensOut,
          m.cost,
          m.durationMs,
          m.success ? 1 : 0,
          m.error ?? null,
          m.userId ?? null,
          m.metadata ? JSON.stringify(m.metadata) : null,
          m.tags ? JSON.stringify(m.tags) : null,
          m.instanceId ?? null
        );
      }
    });

    insertMany();
  }

  async getById(id: string): Promise<QueryMetric | undefined> {
    this.ensureConnected();
    const row = this.db!.prepare('SELECT * FROM metrics WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToMetric(row) : undefined;
  }

  async query(filter: MetricsFilter): Promise<{ metrics: QueryMetric[]; total: number }> {
    this.ensureConnected();
    const { where, params } = this.buildWhereClause(filter);

    const countRow = this.db!.prepare(`SELECT COUNT(*) as count FROM metrics ${where}`).get(
      ...params
    ) as { count: number };
    const total = countRow.count;

    const orderBy = this.buildOrderBy(filter);
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    const rows = this.db!.prepare(`SELECT * FROM metrics ${where} ${orderBy} LIMIT ? OFFSET ?`).all(
      ...params,
      limit,
      offset
    ) as Record<string, unknown>[];

    return {
      metrics: rows.map((r) => this.rowToMetric(r)),
      total,
    };
  }

  async getStats(periodMs: number): Promise<MetricsStoreStats> {
    this.ensureConnected();
    const cutoff = new Date(Date.now() - periodMs).toISOString();

    const statsRow = this.db!.prepare(
      `
      SELECT
        COUNT(*) as queries,
        COALESCE(SUM(cost), 0) as total_cost,
        COALESCE(AVG(duration_ms), 0) as avg_duration,
        COALESCE(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END), 0) as errors
      FROM metrics WHERE timestamp >= ?
    `
    ).get(cutoff) as { queries: number; total_cost: number; avg_duration: number; errors: number };

    const modelRows = this.db!.prepare(
      `
      SELECT model, COUNT(*) as queries, COALESCE(SUM(cost), 0) as cost
      FROM metrics WHERE timestamp >= ?
      GROUP BY model
    `
    ).all(cutoff) as { model: string; queries: number; cost: number }[];

    const byModel: Record<string, { queries: number; cost: number }> = {};
    for (const row of modelRows) {
      byModel[row.model] = { queries: row.queries, cost: row.cost };
    }

    return {
      queries: statsRow.queries,
      cost: statsRow.total_cost,
      avgDuration: statsRow.avg_duration,
      errorRate: statsRow.queries > 0 ? statsRow.errors / statsRow.queries : 0,
      byModel,
    };
  }

  async clear(): Promise<void> {
    this.ensureConnected();
    this.db!.exec('DELETE FROM metrics');
  }

  async prune(policy: RetentionPolicy): Promise<number> {
    this.ensureConnected();
    let pruned = 0;

    if (policy.retentionDays !== undefined) {
      const cutoff = new Date(
        Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000
      ).toISOString();
      const result = this.db!.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoff);
      pruned += result.changes;
    }

    if (policy.maxQueries !== undefined) {
      const countRow = this.db!.prepare('SELECT COUNT(*) as count FROM metrics').get() as {
        count: number;
      };
      if (countRow.count > policy.maxQueries) {
        const excess = countRow.count - policy.maxQueries;
        const result = this.db!.prepare(
          'DELETE FROM metrics WHERE id IN (SELECT id FROM metrics ORDER BY timestamp ASC LIMIT ?)'
        ).run(excess);
        pruned += result.changes;
      }
    }

    return pruned;
  }

  async export(): Promise<QueryMetric[]> {
    this.ensureConnected();
    const rows = this.db!.prepare('SELECT * FROM metrics ORDER BY timestamp DESC').all() as Record<
      string,
      unknown
    >[];
    return rows.map((r) => this.rowToMetric(r));
  }

  private ensureConnected(): void {
    if (!this.db) {
      throw new Error('SQLite store is not connected. Call connect() first.');
    }
  }

  private rowToMetric(row: Record<string, unknown>): QueryMetric {
    return {
      id: row.id as string,
      timestamp: new Date(row.timestamp as string),
      query: row.query as string,
      queryHash: (row.query_hash as string) ?? undefined,
      contextBytes: row.context_bytes as number,
      model: row.model as string,
      iterations: row.iterations as number,
      tokensIn: row.tokens_in as number,
      tokensOut: row.tokens_out as number,
      cost: row.cost as number,
      durationMs: row.duration_ms as number,
      success: (row.success as number) === 1,
      error: (row.error as string) ?? undefined,
      userId: (row.user_id as string) ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      tags: row.tags ? JSON.parse(row.tags as string) : undefined,
      instanceId: (row.instance_id as string) ?? undefined,
    };
  }

  private buildWhereClause(filter: MetricsFilter): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.since) {
      conditions.push('timestamp >= ?');
      params.push(filter.since.toISOString());
    }
    if (filter.until) {
      conditions.push('timestamp <= ?');
      params.push(filter.until.toISOString());
    }
    if (filter.model) {
      conditions.push('model = ?');
      params.push(filter.model);
    }
    if (filter.success !== undefined) {
      conditions.push('success = ?');
      params.push(filter.success ? 1 : 0);
    }
    if (filter.minCost !== undefined) {
      conditions.push('cost >= ?');
      params.push(filter.minCost);
    }
    if (filter.maxCost !== undefined) {
      conditions.push('cost <= ?');
      params.push(filter.maxCost);
    }
    if (filter.instanceId) {
      conditions.push('instance_id = ?');
      params.push(filter.instanceId);
    }
    if (filter.queryContains) {
      conditions.push('query LIKE ?');
      params.push(`%${filter.queryContains}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  private buildOrderBy(filter: MetricsFilter): string {
    const dir = filter.orderDirection === 'asc' ? 'ASC' : 'DESC';
    switch (filter.orderBy) {
      case 'timestamp':
        return `ORDER BY timestamp ${dir}`;
      case 'cost':
        return `ORDER BY cost ${dir}`;
      case 'duration':
        return `ORDER BY duration_ms ${dir}`;
      default:
        return 'ORDER BY timestamp DESC';
    }
  }
}
