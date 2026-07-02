# ADR-006: Load Estimation and Scaling Strategy

## Status

Proposed

## Context

The design document mentions "scaling considerations (post-MVP)" but provides no concrete load estimates. Without understanding baseline load, it's impossible to:
- Right-size Railway dyno resources
- Validate the <30 second notification SLA (Requirement 6.1)
- Know when to add read replicas or scale workers
- Set appropriate connection pool sizes
- Budget for infrastructure costs

## Decision

Document explicit load estimates based on target market assumptions, and define scaling triggers.

### Target Market Assumptions (MVP Phase)

| Metric | Estimate | Rationale |
|---|---|---|
| Number of schools (tenants) | 10-50 | MVP year 1 target |
| Students per school | 200-600 | Typical Indonesian SD/SMP |
| Teachers per school | 15-40 | Standard staffing ratio |
| Parents per school | 150-500 | Some share phone numbers |
| Classes per school | 6-18 | 1-6 grades × 1-3 parallel classes |

### Daily Traffic Patterns

**Peak window: 07:00 - 08:30 (attendance input)**

| Operation | Volume/day (50 schools) | Peak RPS | Duration |
|---|---|---|---|
| Teacher logins | ~500 | ~5/s at 07:00 | Burst |
| Attendance submissions | ~500 (1 per class per day) | ~10/s at 07:00-08:00 | 1 hour |
| Notification sends (FCM) | ~15,000 (500 classes × 30 students) | ~250/min | 1 hour |
| Parent logins | ~5,000 | ~3/s spread across day | All day |
| Parent views (attendance, billing) | ~10,000 | ~7/s | 07:00-20:00 |
| Payment uploads | ~200 | <1/s | Spread |
| Billing generation | ~50 (batch, monthly) | N/A (background) | Rare |

**Estimated peak concurrent users**: ~200-500 (primarily during morning attendance)
**Estimated daily API requests**: ~50,000-100,000

### Resource Sizing (MVP)

| Resource | Size | Justification |
|---|---|---|
| API Server (Railway) | 1GB RAM, 1 vCPU | Handles ~200 concurrent connections comfortably for NestJS |
| Worker (Railway) | 512MB RAM, 0.5 vCPU | Notification processing is I/O-bound (FCM HTTP calls) |
| PostgreSQL | 1GB RAM, 10GB storage | 50 schools × 500 students × 12 months = ~300K tagihan/year + attendance |
| Redis | 256MB | Token blacklist + Bull queues + rate limit counters |
| Cloudflare R2 | Pay-per-use | ~200 uploads/day × 200KB avg = ~40MB/day new storage |

### Database Size Projections (Year 1, 50 schools)

| Table | Rows/year | Growth rate |
|---|---|---|
| absensi | ~3M (50 schools × 300 students × 200 days) | Linear with schools |
| tagihan | ~180K (50 × 300 × 12 months) | Linear |
| notifikasi | ~5M (high volume, multiple per student per day) | Linear, needs pruning |
| audit_trail | ~500K | Linear |
| rapor_nilai | ~600K (50 × 300 × 4 periods) | Linear |

### Connection Pool Configuration

```typescript
// Drizzle/pg pool settings
{
  max: 20,           // Max connections (Railway PG default limit: 97)
  min: 5,            // Keep 5 warm connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
}
```

### Scaling Triggers

| Metric | Threshold | Action |
|---|---|---|
| API response p95 > 500ms | Sustained 5 min | Add API replica |
| Bull queue depth > 500 | Sustained 2 min | Add worker replica or increase concurrency |
| PostgreSQL connections > 80% | Sustained | Increase pool or add read replica |
| Redis memory > 200MB | Sustained | Upgrade Redis tier |
| Notification delivery p95 > 25s | Any occurrence | Investigate; increase worker concurrency |
| API error rate > 1% | Sustained 5 min | Alert + investigate |

### Notification SLA Validation

Requirement 6.1: <30 seconds from attendance save to push delivery.

**Budget breakdown:**
- API saves attendance: ~50ms
- Enqueue to Bull: ~5ms
- Queue wait time (concurrency 5, burst 250/min): ~200ms worst case
- Notification processor (DB lookups + preference check): ~100ms
- FCM HTTP call: ~200-500ms
- **Total: ~500-850ms** — well within 30s even at 10x load

The SLA is comfortably achievable at MVP scale. Risk increases only if queue depth grows due to worker failure.

### Post-MVP Scaling Path

1. **50-200 schools**: Add API replica (horizontal), add read replica for reporting queries
2. **200-500 schools**: Separate worker into dedicated service, consider Bull Board for monitoring
3. **500+ schools**: Evaluate splitting notification service, consider connection pooling (PgBouncer)

## Alternatives Considered

- **Over-provision from day 1** — Wastes money. Railway charges by resource-hour. Running 4 replicas for 10 schools is burning cash.
- **Serverless (Lambda/Cloud Functions)** — eliminates scaling concerns but adds cold start latency, complicates Bull queue architecture, and Railway doesn't offer serverless.
- **No estimation (wing it)** — leads to surprise costs, SLA failures, and reactive firefighting.

## Consequences

### Positive
- Clear resource budgeting for infrastructure costs
- Defined triggers prevent guesswork on when to scale
- Notification SLA is validated mathematically (not just "probably fine")
- Team knows the growth ceiling before architectural changes are needed

### Negative
- Estimates are based on assumptions; actual traffic may differ
- Must revisit this document when onboarding first 10 schools with real data
- Some scaling triggers require monitoring infrastructure not yet built

## Trade-offs

Right-sizing for known load is prioritized over premature scaling. The system is designed to run lean at MVP while having a documented path to handle 10x growth without architectural changes.
