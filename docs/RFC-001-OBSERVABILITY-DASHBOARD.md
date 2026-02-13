# RFC-001: RLM Observability Dashboard

**Status:** Approved  
**Author:** Dr Nefario  
**Created:** 2026-02-13  
**Updated:** 2026-02-13  
**Target:** RLM v1.0  
**Repository:** `hampton-io/rlm-dashboard` (standalone)

## Summary

A standalone observability dashboard for RLM, enabling enterprise customers to monitor queries, costs, performance, and content health. Deployed separately from RLM instances, connecting via authenticated API.

## Motivation

### Problem Statement

Organizations using RLM to replace traditional RAG systems need answers to:

1. **What's happening?** Which queries are running, what's being asked?
2. **Is it working?** Are queries succeeding? Finding relevant content?
3. **What's it costing?** Per query, per day, per user/department?
4. **Is the content healthy?** Stale sources? Gaps? Duplicates?
5. **Who asked what?** Audit trail for compliance/governance

Without observability, RLM is a black box. Enterprises won't adopt black boxes for critical knowledge systems.

### Business Case

- **Differentiation:** Most RAG solutions have poor observability
- **Enterprise readiness:** Observability is table stakes for adoption
- **Cost control:** Visibility into spending prevents surprise bills
- **Trust:** Users trust systems they can inspect

## Architecture Decision

### Standalone Application

The dashboard is a **separate application** that connects to RLM instances remotely.

```
┌─────────────────────┐         ┌─────────────────────────┐
│   RLM Instance      │◀─HTTPS─▶│   RLM Dashboard         │
│                     │  + API  │   (Next.js 16)          │
│ /api/metrics/*      │   Key   │                         │
│ (new endpoints)     │         │   NextAuth sessions     │
│                     │         │   SQLite/Postgres       │
└─────────────────────┘         └─────────────────────────┘
                                          │
                                          ▼
                                   Enterprise User
                                   (authenticated)
```

**Why standalone:**
- Clean separation of concerns
- Dashboard can be deployed to Vercel or self-hosted
- RLM stays lightweight
- Future: monitor multiple RLM instances from one dashboard

**Repository:** `hampton-io/rlm-dashboard`

## Tech Stack (Decided)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 16 (App Router) | Consistent with Hampton.io stack |
| React | React 19 | Latest, server components |
| Styling | Tailwind CSS 4 | Utility-first, fast iteration |
| Components | shadcn/ui | Consistent with other projects |
| Charts | Tremor + Recharts | Built for dashboards, React-native |
| Database | Prisma 7 + SQLite | Zero-config default |
| Database (alt) | PostgreSQL | Enterprise scale option |
| Auth | NextAuth.js | Flexible, supports OIDC/SAML |

**Bundle size:** Not a constraint (enterprise deployment, not embedded)

## Security Model

### 1. RLM API Authentication

RLM exposes metrics endpoints protected by API key:

```typescript
// RLM configuration (rlm.config.ts)
export default {
  metrics: {
    enabled: true,
    apiKey: process.env.RLM_METRICS_API_KEY,
    endpoints: {
      queries: true,    // GET /api/metrics/queries
      stats: true,      // GET /api/metrics/stats
      health: true,     // GET /api/metrics/health
      content: true,    // GET /api/metrics/content
    },
  },
};
```

Dashboard connects with:
```
Authorization: Bearer <RLM_METRICS_API_KEY>
```

### 2. Dashboard Authentication (NextAuth)

**Phase 1:** Email/password or magic link
```typescript
// app/api/auth/[...nextauth]/route.ts
export const authOptions = {
  providers: [
    CredentialsProvider({ ... }),
    EmailProvider({ ... }),
  ],
};
```

**Phase 2 (Enterprise):** OIDC/SAML
```typescript
providers: [
  AzureADProvider({ ... }),
  OktaProvider({ ... }),
],
```

### 3. Transport Security

- HTTPS enforced (no plaintext API connections)
- Optional: mTLS for zero-trust environments

### 4. Data Protection

| Data | Default | Enterprise Option |
|------|---------|-------------------|
| Query text | Stored | Hash/redact option |
| Results | Never stored | Opt-in storage |
| Costs | Stored | Always |
| Timestamps | Stored | Always |

### 5. Access Control (Phase 2)

| Role | Permissions |
|------|-------------|
| Admin | Full access, config, export, clear data |
| Viewer | Read-only dashboards |
| Auditor | Query history + export only |

## RLM Changes Required

New endpoints in RLM core (`/api/metrics/*`):

```typescript
// New file: src/metrics/api.ts

GET  /api/metrics/queries
  ?limit=100
  ?offset=0
  ?since=2026-02-01
  ?model=gemini-2.0-flash
  Response: { queries: QueryLog[], total: number }

GET  /api/metrics/queries/:id
  Response: QueryLog (full detail)

GET  /api/metrics/stats
  ?period=day|week|month
  Response: {
    queries: number,
    cost: number,
    avgDuration: number,
    errorRate: number,
    byModel: { [model]: { queries, cost } }
  }

GET  /api/metrics/health
  Response: {
    status: 'healthy' | 'degraded',
    uptime: number,
    activeQueries: number,
    lastQuery: Date
  }

GET  /api/metrics/content
  Response: {
    sources: ContentSource[],
    totalBytes: number,
    healthScore: number
  }
```

**Implementation:** Feature branch `feature/metrics-api` in RLM repo.

## Core Features

### 1. Query Analytics

**Dashboard view:**
- Real-time query feed (WebSocket or polling)
- Success/failure rates with sparklines
- Iterations per query distribution
- Token usage breakdown
- Cost per query

**Data model:**
```typescript
interface QueryLog {
  id: string;
  timestamp: Date;
  query: string;           // Optionally hashed
  contextBytes: number;
  model: string;
  iterations: number;
  tokensUsed: number;
  cost: number;
  durationMs: number;
  success: boolean;
  error?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}
```

### 2. Cost Management

**Dashboard view:**
- KPI cards: today, this week, this month
- Cost trend chart (line/area)
- Cost by model (pie/bar)
- Budget alerts configuration

**Alerts:**
```typescript
interface CostAlert {
  threshold: number;      // e.g., $10/day
  period: 'day' | 'week' | 'month';
  notifyEmail?: string;
  notifyWebhook?: string;
}
```

### 3. Performance Metrics

**Dashboard view:**
- Latency percentiles (p50, p95, p99)
- Queries per hour chart
- Error rate trend
- Active queries gauge

### 4. Content Health

**Dashboard view:**
- File tree of content sources
- Last modified timestamps
- Freshness indicators (green/yellow/red)
- Total size and line counts

### 5. Audit Trail

**Dashboard view:**
- Searchable query history table
- Filters: date range, model, user, success/fail
- Export to CSV/JSON
- Retention policy configuration

## UI Wireframes

### Dashboard Home
```
┌─────────────────────────────────────────────────────────────┐
│  RLM Dashboard            [instance: prod]    [⚙️] [👤]    │
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
│  Recent Queries                                    [View All]│
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟢 "What are the Q4 revenue targets?" │ 2.1s │$0.002│   │
│  │ 🟢 "Summarize the board minutes"      │ 4.3s │$0.008│   │
│  │ 🔴 "Find John's email" (not found)    │ 1.2s │$0.001│   │
│  │ 🟢 "List all product SKUs"            │ 1.8s │$0.001│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Sidebar Navigation
```
📊 Dashboard (home)
📝 Queries
💰 Costs
📈 Performance
📁 Content
⚙️ Settings
```

## Database Schema (Prisma)

```prisma
// prisma/schema.prisma

model Query {
  id          String   @id @default(cuid())
  timestamp   DateTime @default(now())
  queryText   String?  // null if redacted
  queryHash   String?  // SHA256 if redacted
  contextBytes Int
  model       String
  iterations  Int
  tokensIn    Int
  tokensOut   Int
  cost        Float
  durationMs  Int
  success     Boolean
  error       String?
  userId      String?
  
  @@index([timestamp])
  @@index([model])
  @@index([success])
}

model CostAlert {
  id        String   @id @default(cuid())
  threshold Float
  period    String   // 'day' | 'week' | 'month'
  email     String?
  webhook   String?
  enabled   Boolean  @default(true)
  lastTriggered DateTime?
}

model RlmInstance {
  id       String  @id @default(cuid())
  name     String
  endpoint String
  apiKey   String  // encrypted
  active   Boolean @default(true)
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)

**RLM repo (`feature/metrics-api`):**
- [ ] Add metrics collection to query execution
- [ ] Implement `/api/metrics/*` endpoints
- [ ] Add API key authentication
- [ ] Write tests

**Dashboard repo (initial scaffold):**
- [ ] Create Next.js 16 app
- [ ] Set up Prisma + SQLite
- [ ] Implement NextAuth (email/password)
- [ ] Create basic layout with shadcn/ui

### Phase 2: Core Dashboard (Week 2)

- [ ] Dashboard home with KPI cards
- [ ] Query list page with pagination
- [ ] Cost breakdown page
- [ ] RLM instance connection setup
- [ ] Basic polling for data refresh

### Phase 3: Polish (Week 3)

- [ ] Charts with Tremor/Recharts
- [ ] Content health page
- [ ] Export functionality
- [ ] Settings page
- [ ] Dark mode

### Phase 4: Enterprise Ready (Week 4)

- [ ] OIDC/SAML auth option
- [ ] Query text redaction option
- [ ] Retention policies
- [ ] PostgreSQL support
- [ ] Docker deployment

## Configuration

### Dashboard Environment

```env
# .env.local

# RLM Connection
RLM_ENDPOINT=https://rlm.company.com
RLM_API_KEY=rlm_metrics_xxx

# Database
DATABASE_URL="file:./rlm-dashboard.db"
# or: DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_SECRET=xxx
NEXTAUTH_URL=https://dashboard.company.com

# Optional: OIDC
AZURE_AD_CLIENT_ID=xxx
AZURE_AD_CLIENT_SECRET=xxx
AZURE_AD_TENANT_ID=xxx
```

### RLM Configuration

```typescript
// rlm.config.ts
export default {
  metrics: {
    enabled: true,
    apiKey: process.env.RLM_METRICS_API_KEY,
    redactQueries: false,  // Set true for PII protection
    retention: '30d',      // How long to keep in RLM
  },
};
```

## Success Metrics

1. **Adoption:** % of enterprise RLM deployments using dashboard
2. **Engagement:** Weekly active users per deployment
3. **Value:** Cost savings from model optimization recommendations
4. **Sales:** Enterprise deals influenced by dashboard feature

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Embedded or standalone? | **Standalone** (separate repo) |
| Tech stack? | **Next.js 16, React 19, Tailwind 4, Prisma 7** |
| Bundle size constraint? | **No** (enterprise deployment) |
| Multi-instance support? | **Later** (single instance first) |
| Real-time updates? | **Polling first**, WebSocket later |

## Future Considerations

- Multi-instance aggregation
- Hosted SaaS option
- Grafana/Datadog export
- Cost anomaly detection (ML)
- Query suggestion/optimization

## References

- [Tremor](https://tremor.so/) - React dashboard components
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [NextAuth.js](https://next-auth.js.org/) - Authentication
- [LangSmith](https://smith.langchain.com/) - Competitor reference

---

*Approved 2026-02-13. Implementation begins in `hampton-io/rlm-dashboard`.*
