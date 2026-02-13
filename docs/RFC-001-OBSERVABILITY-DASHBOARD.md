# RFC-001: RLM Observability Dashboard

**Status:** Draft  
**Author:** Dr Nefario  
**Created:** 2026-02-13  
**Target:** RLM v1.0

## Summary

Add an observability dashboard to RLM for monitoring queries, costs, performance, and content health. This positions RLM as an enterprise-ready RAG replacement with built-in operational visibility.

## Motivation

### Problem Statement

Organizations using RLM to replace traditional RAG systems need answers to:

1. **What's happening?** - Which queries are running, what's being asked?
2. **Is it working?** - Are queries succeeding? Finding relevant content?
3. **What's it costing?** - Per query, per day, per user/department?
4. **Is the content healthy?** - Stale sources? Gaps? Duplicates?
5. **Who asked what?** - Audit trail for compliance/governance

Without observability, RLM is a black box. Enterprises won't adopt black boxes for critical knowledge systems.

### Business Case

- **Differentiation:** Most RAG solutions have poor observability. Built-in dashboard = competitive advantage.
- **Enterprise readiness:** Observability is table stakes for enterprise adoption.
- **Cost control:** Visibility into spending prevents surprise bills.
- **Trust:** Users trust systems they can inspect.

## Proposed Solution

### Architecture Options

**Option A: Embedded Dashboard**
```
rlm serve --port 3000 --dashboard
# Serves API + dashboard on same port
```

Pros: Single deployment, simple setup  
Cons: Couples dashboard to RLM runtime

**Option B: Separate Package**
```bash
npm install @rlm/dashboard
rlm-dashboard --rlm-endpoint http://localhost:3000
```

Pros: Decoupled, can monitor multiple RLM instances  
Cons: Additional deployment

**Option C: Hosted Service (Future)**
```bash
rlm serve --telemetry-endpoint https://dash.rlm.dev
```

Pros: Zero setup, cross-instance aggregation  
Cons: Data leaves customer environment, requires infrastructure

**Recommendation:** Start with Option A (embedded), design for Option B extraction later.

### Core Features

#### 1. Query Analytics

**Must Have:**
- Real-time query feed (last N queries)
- Query success/failure rates
- Average iterations per query
- Token usage per query
- Cost per query

**Nice to Have:**
- Query categorization (auto-tagging by topic)
- Similar query grouping
- Failed query analysis (why did it fail?)

**Data Model:**
```typescript
interface QueryLog {
  id: string;
  timestamp: Date;
  query: string;
  contextBytes: number;
  model: string;
  iterations: number;
  tokensUsed: number;
  cost: number;
  durationMs: number;
  success: boolean;
  result?: string;
  error?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}
```

#### 2. Cost Management

**Must Have:**
- Total cost (today, this week, this month)
- Cost by model
- Cost trend chart
- Budget threshold alerts

**Nice to Have:**
- Cost by user/department
- Cost forecasting
- Model cost comparison (same query, different models)
- Optimization recommendations ("Switch to gemini-2.0-flash to save 80%")

**Data Model:**
```typescript
interface CostSummary {
  period: 'day' | 'week' | 'month';
  totalCost: number;
  totalQueries: number;
  avgCostPerQuery: number;
  byModel: Record<string, { queries: number; cost: number }>;
  byUser?: Record<string, { queries: number; cost: number }>;
}
```

#### 3. Performance Metrics

**Must Have:**
- Query latency (p50, p95, p99)
- Queries per minute/hour
- Active queries count
- Error rate

**Nice to Have:**
- Latency by model comparison
- Latency by context size correlation
- Rate limit status per provider
- Queue depth (if async processing)

#### 4. Content Health

**Must Have:**
- Content sources inventory (files loaded)
- Total content size
- Last update timestamp per source

**Nice to Have:**
- Content freshness scoring
- Coverage analysis (topics well-covered vs gaps)
- Duplicate detection
- Stale content alerts

**Data Model:**
```typescript
interface ContentSource {
  path: string;
  sizeBytes: number;
  lines: number;
  lastModified: Date;
  lastQueried?: Date;
  queryHitCount: number;
  freshnessScore?: number; // 0-100
}
```

#### 5. Audit Trail

**Must Have:**
- Full query history (paginated)
- Search/filter by date, user, query text
- Export to CSV/JSON

**Nice to Have:**
- Retention policies
- Compliance tagging (PII detection)
- Access control (who can view what)

### UI Design

#### Dashboard Home
```
┌─────────────────────────────────────────────────────────────┐
│  RLM Dashboard                              [Settings] [?]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Queries  │ │   Cost   │ │ Avg Time │ │  Errors  │       │
│  │   142    │ │  $1.24   │ │   3.2s   │ │   2.1%   │       │
│  │  today   │ │  today   │ │   p50    │ │  today   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  Query Volume (24h)              Cost by Model (7d)         │
│  ┌─────────────────────┐        ┌─────────────────────┐    │
│  │    ╭─╮              │        │ ████ gemini-2.0     │    │
│  │   ╭╯ ╰╮   ╭─╮      │        │ ██   gpt-5.2        │    │
│  │  ╭╯   ╰───╯ ╰─╮    │        │ █    claude-haiku   │    │
│  │ ─╯            ╰──  │        │                     │    │
│  └─────────────────────┘        └─────────────────────┘    │
│                                                             │
│  Recent Queries                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟢 "What are the Q4 revenue targets?" - 2.1s $0.002 │   │
│  │ 🟢 "Summarize the board minutes" - 4.3s $0.008     │   │
│  │ 🔴 "Find John's email" - failed (not found)        │   │
│  │ 🟢 "List all product SKUs" - 1.8s $0.001           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Content Explorer
```
┌─────────────────────────────────────────────────────────────┐
│  Content Sources                        [Refresh] [+ Add]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 Knowledge Base (4 sources, 2.3 MB total)               │
│  ├── 📄 company-handbook.md    │ 156 KB │ 2d ago │ 🟢     │
│  ├── 📄 product-catalog.json   │ 892 KB │ 1h ago │ 🟢     │
│  ├── 📄 meeting-notes/         │ 1.1 MB │ 5m ago │ 🟢     │
│  └── 📄 legacy-docs.pdf        │ 203 KB │ 89d ago│ 🔴     │
│                                                             │
│  Health Score: 87/100                                       │
│  ⚠️ 1 stale source (legacy-docs.pdf - 89 days old)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Technical Implementation

#### Storage Backend

**Option A: SQLite (embedded)**
```typescript
// Zero config, file-based, good for single-instance
import Database from 'better-sqlite3';
const db = new Database('rlm-metrics.db');
```

**Option B: PostgreSQL (scalable)**
```typescript
// For multi-instance, high-volume deployments
const connectionString = process.env.RLM_METRICS_DB;
```

**Recommendation:** SQLite default, Postgres optional via config.

#### API Endpoints

```
GET  /api/dashboard/stats          # Summary stats
GET  /api/dashboard/queries        # Query history (paginated)
GET  /api/dashboard/queries/:id    # Single query detail
GET  /api/dashboard/costs          # Cost breakdown
GET  /api/dashboard/content        # Content sources
GET  /api/dashboard/health         # System health
POST /api/dashboard/export         # Export data
```

#### Frontend Stack

- **Framework:** Preact (tiny, fast, React-compatible)
- **Charts:** uPlot (lightweight) or Chart.js
- **Styling:** Tailwind CSS (utility classes, small bundle)
- **Build:** Vite (fast dev, optimized production)

Total bundle target: <100KB gzipped

### Configuration

```typescript
// rlm.config.ts
export default {
  dashboard: {
    enabled: true,
    port: 3001,              // Separate port, or same as API
    auth: {
      type: 'basic',         // 'none' | 'basic' | 'oidc'
      username: 'admin',
      password: process.env.RLM_DASHBOARD_PASSWORD,
    },
    retention: {
      queryLogs: '30d',      // How long to keep query history
      metrics: '90d',        // How long to keep aggregated metrics
    },
    alerts: {
      costThreshold: 10.00,  // Alert when daily cost exceeds
      errorRateThreshold: 0.05, // Alert when error rate exceeds 5%
    },
  },
};
```

### Privacy & Security

1. **Query content:** Option to hash/redact query text in logs
2. **Results:** Never store full results by default (opt-in)
3. **PII detection:** Flag queries that might contain PII
4. **Access control:** Basic auth minimum, OIDC for enterprise
5. **Data residency:** All data stays local (no phone-home)

### Rollout Plan

**Phase 1: Metrics Collection (v0.6)**
- Add query logging to RLM core
- SQLite storage
- Basic CLI for viewing stats: `rlm stats`

**Phase 2: Basic Dashboard (v0.7)**
- Embedded web UI
- Query list, cost summary, basic charts
- No auth required (localhost only)

**Phase 3: Production Ready (v0.8)**
- Authentication
- Retention policies
- Export functionality
- Content health monitoring

**Phase 4: Enterprise (v1.0)**
- Multi-instance aggregation
- OIDC/SAML auth
- Role-based access control
- Compliance features

### Success Metrics

1. **Adoption:** % of RLM deployments with dashboard enabled
2. **Engagement:** Dashboard page views per deployment
3. **Value:** Users who enable cost alerts save $X on average
4. **Enterprise:** Leads generated from dashboard feature

### Open Questions

1. Should the dashboard be a separate npm package from day 1?
2. How much query history is too much? (Storage vs utility tradeoff)
3. Do we need real-time updates (WebSocket) or is polling OK?
4. Should we support multiple RLM instances in one dashboard?
5. Is there demand for a hosted/SaaS version?

### Alternatives Considered

**1. External observability (Datadog, Grafana)**
- Pros: Mature tooling, existing enterprise adoption
- Cons: Requires setup, cost, data leaves environment
- Verdict: Support as option, but built-in is primary

**2. Just logging (no UI)**
- Pros: Simple, composable
- Cons: Bad UX, requires external tools to visualize
- Verdict: Logs are foundation, but UI is the product

**3. CLI-only stats**
- Pros: Zero frontend complexity
- Cons: Limited visualization, poor discoverability
- Verdict: Good for Phase 1, not sufficient long-term

## References

- [OpenTelemetry](https://opentelemetry.io/) - Observability standard
- [Grafana](https://grafana.com/) - Dashboard inspiration
- [LangSmith](https://smith.langchain.com/) - LLM observability (competitor)
- [Weights & Biases](https://wandb.ai/) - ML experiment tracking

---

## Appendix A: Competitive Analysis

| Feature | RLM (proposed) | LangSmith | Helicone | OpenAI Dashboard |
|---------|----------------|-----------|----------|------------------|
| Self-hosted | ✅ | ❌ | ✅ | ❌ |
| Query logs | ✅ | ✅ | ✅ | Limited |
| Cost tracking | ✅ | ✅ | ✅ | ✅ |
| Content health | ✅ | ❌ | ❌ | ❌ |
| Free tier | ✅ (OSS) | Limited | Limited | ❌ |
| Multi-provider | ✅ | ✅ | ✅ | ❌ |

## Appendix B: Effort Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Metrics | 2-3 days | None |
| Phase 2: Basic UI | 5-7 days | Phase 1 |
| Phase 3: Production | 5-7 days | Phase 2 |
| Phase 4: Enterprise | 10-15 days | Phase 3 |

Total: ~25-30 days for full feature set

---

*This RFC is open for feedback. Comment on GitHub or reach out directly.*
