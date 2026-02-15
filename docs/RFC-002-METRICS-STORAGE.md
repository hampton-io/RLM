# RFC-002: Enterprise Metrics Storage

**Status:** Draft  
**Author:** Dr Nefario  
**Date:** 2026-02-15  

## Problem Statement

The current metrics storage (`~/.rlm/metrics.json`) has significant limitations:

1. **Single global store** - All RLM processes on a machine share one metrics file
2. **JSON file persistence** - Not suitable for concurrent writes, large datasets, or querying
3. **No isolation** - Different projects/use cases pollute each other's metrics
4. **No scalability** - File-based storage doesn't scale for enterprise workloads

## Requirements

### Functional
- **Multi-store support:** Users can specify different metrics stores per project/instance
- **Concurrent writes:** Multiple RLM processes can write metrics simultaneously
- **Query capability:** Filter, aggregate, and search metrics efficiently
- **Retention policies:** Auto-cleanup of old metrics (configurable TTL)
- **Export/import:** Migrate metrics between stores

### Non-Functional
- **Minimal dependencies:** Core RLM should work without external DB servers
- **Backward compatible:** JSON file store remains the default for simplicity
- **Pluggable:** Adapter pattern allows custom storage backends

## Proposed Solution

### Storage Adapter Interface

```typescript
interface MetricsStore {
  // Write operations
  record(query: QueryMetric): Promise<void>;
  recordBatch(queries: QueryMetric[]): Promise<void>;
  
  // Read operations
  getStats(filter?: MetricsFilter): Promise<MetricsStats>;
  getQueries(filter?: MetricsFilter, pagination?: Pagination): Promise<QueryMetric[]>;
  getQueryById(id: string): Promise<QueryMetric | null>;
  
  // Management
  clear(filter?: MetricsFilter): Promise<number>;
  prune(olderThan: Date): Promise<number>;
  export(format: 'json' | 'csv'): Promise<string>;
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}

interface MetricsFilter {
  model?: string | string[];
  status?: 'success' | 'error';
  minCost?: number;
  maxCost?: number;
  startDate?: Date;
  endDate?: Date;
  queryContains?: string;
  tags?: string[];
}

interface QueryMetric {
  id: string;
  timestamp: Date;
  query: string;           // Optionally redacted
  model: string;
  tokens: { input: number; output: number };
  cost: number;
  duration: number;        // ms
  status: 'success' | 'error';
  error?: string;
  iterations?: number;
  tags?: string[];         // User-defined categorization
  instanceId?: string;     // Which RLM instance/project
}
```

### Built-in Adapters

#### 1. JSON File (Default)
- Current behavior, improved with file locking
- Best for: Single-user, local development
- Config: `RLM_METRICS_FILE=~/.rlm/metrics.json`

#### 2. SQLite
- Embedded database, no server required
- Best for: Multi-process, moderate scale, local persistence
- Config: `RLM_METRICS_SQLITE=~/.rlm/metrics.db`

```sql
CREATE TABLE queries (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  query TEXT,
  model TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost REAL,
  duration INTEGER,
  status TEXT,
  error TEXT,
  iterations INTEGER,
  instance_id TEXT,
  tags TEXT,  -- JSON array
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_timestamp ON queries(timestamp);
CREATE INDEX idx_model ON queries(model);
CREATE INDEX idx_instance ON queries(instance_id);
CREATE INDEX idx_status ON queries(status);
```

#### 3. Redis
- In-memory with optional persistence
- Best for: High-throughput, distributed systems, real-time dashboards
- Config: `RLM_METRICS_REDIS=redis://localhost:6379/0`

```
Key structure:
  rlm:metrics:{instance_id}:queries:{id} -> Hash
  rlm:metrics:{instance_id}:stats -> Hash (cached aggregates)
  rlm:metrics:{instance_id}:queries:by_time -> Sorted Set (timestamp index)
```

#### 4. PostgreSQL (Future)
- Full SQL capabilities
- Best for: Enterprise, complex queries, existing infrastructure
- Config: `RLM_METRICS_POSTGRES=postgres://user:pass@host/db`

### Instance Isolation

Each RLM process can specify an instance ID to isolate its metrics:

```bash
# Different projects use different stores
RLM_METRICS_INSTANCE=memory-agent npx tsx src/cli.ts ...
RLM_METRICS_INSTANCE=code-review npx tsx src/cli.ts ...
RLM_METRICS_INSTANCE=customer-support npx tsx src/cli.ts ...
```

With SQLite/Redis, metrics are partitioned by instance. The dashboard can filter by instance or show aggregated views.

### Configuration

```typescript
interface MetricsConfig {
  // Storage backend
  store: 'json' | 'sqlite' | 'redis' | 'postgres' | 'custom';
  
  // Connection string or path
  connection: string;
  
  // Instance identification
  instanceId?: string;
  instanceName?: string;
  
  // Privacy
  redactQueries?: boolean;    // Don't store query text
  redactThreshold?: number;   // Redact queries over N tokens
  
  // Retention
  maxQueries?: number;        // Max queries to keep
  retentionDays?: number;     // Auto-prune after N days
  
  // Performance
  batchSize?: number;         // Batch writes for throughput
  flushIntervalMs?: number;   // How often to flush batches
  
  // API
  apiKey?: string;            // For metrics server auth
}
```

### CLI Usage

```bash
# Use SQLite for this project
RLM_METRICS_STORE=sqlite \
RLM_METRICS_SQLITE=./project-metrics.db \
RLM_METRICS_INSTANCE=my-agent \
npx tsx src/cli.ts "query" --metrics

# Use Redis for high-throughput
RLM_METRICS_STORE=redis \
RLM_METRICS_REDIS=redis://metrics-server:6379 \
RLM_METRICS_INSTANCE=prod-support \
npx tsx src/cli.ts "query" --metrics

# Metrics server connects to same store
RLM_METRICS_STORE=sqlite \
RLM_METRICS_SQLITE=./project-metrics.db \
npx tsx src/metrics/server.ts
```

### Dashboard Enhancements

- Instance selector dropdown
- Cross-instance comparison views
- Cost allocation by instance/project
- Export filtered data to CSV/JSON

## Migration Path

1. **Phase 1:** Add adapter interface, refactor JSON store to use it
2. **Phase 2:** Implement SQLite adapter (recommended default for most users)
3. **Phase 3:** Implement Redis adapter
4. **Phase 4:** Dashboard multi-instance support
5. **Phase 5:** PostgreSQL adapter (community contribution welcome)

## Alternatives Considered

### InfluxDB / TimescaleDB
- Overkill for most RLM use cases
- Adds significant operational complexity
- Could be added as community adapter later

### Cloud-native (DynamoDB, Firestore)
- Requires cloud credentials
- Not suitable for offline/local development
- Could be added as enterprise adapters

### Embedded analytics (DuckDB)
- Great for analytics queries
- Less mature ecosystem
- Consider for future analytics-focused features

## Open Questions

1. Should we support multiple simultaneous stores (e.g., local SQLite + remote Redis)?
2. Should the metrics server support connecting to multiple instances simultaneously?
3. What's the right default retention policy? (Suggest: 10,000 queries or 30 days)
4. Should we add cost budgets/alerts at the metrics layer?

## Implementation Estimate

- Adapter interface + refactor: 2-3 days
- SQLite adapter: 2-3 days  
- Redis adapter: 2-3 days
- Dashboard updates: 2-3 days
- Testing + docs: 2-3 days

**Total: 10-15 days**

## References

- Current implementation: `src/metrics/collector.ts`
- Metrics API: `src/metrics/api.ts`
- Dashboard: `hampton-io/RLM-Dashboard`
