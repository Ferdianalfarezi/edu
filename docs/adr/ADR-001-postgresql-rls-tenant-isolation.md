# ADR-001: Add PostgreSQL Row-Level Security for Multi-Tenant Isolation

## Status

Proposed

## Context

The system uses shared-schema multi-tenancy where every table has a `tenant_id` column. Tenant isolation is enforced at the application layer via a `TenantInterceptor` that auto-injects `tenant_id` filters into Drizzle ORM queries.

This approach has a known failure mode: a single missed filter (raw query, complex join, subquery, aggregation, or CTE that doesn't propagate context) results in cross-tenant data leakage. Drizzle ORM does not provide built-in row-level security enforcement like some other ORMs.

Given that the system handles sensitive data (children's attendance, financial records, academic grades), a single cross-tenant leak is a critical severity incident.

## Decision

Enable PostgreSQL Row-Level Security (RLS) as a defense-in-depth layer on all tenant-scoped tables.

### Implementation

1. Set `app.tenant_id` on each database connection using `SET LOCAL`:
```sql
SET LOCAL app.tenant_id = '<uuid>';
```

2. Enable RLS on every tenant-scoped table:
```sql
ALTER TABLE siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE absensi ENABLE ROW LEVEL SECURITY;
ALTER TABLE tagihan ENABLE ROW LEVEL SECURITY;
-- ... all tenant-scoped tables
```

3. Create policies that enforce tenant isolation:
```sql
CREATE POLICY tenant_isolation ON siswa
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

4. Use a separate superuser role for migrations (bypasses RLS) and an application role with RLS enforced.

5. For cross-tenant parent access, use `SET LOCAL app.tenant_ids = '{uuid1,uuid2}'` with a policy:
```sql
CREATE POLICY parent_cross_tenant ON siswa
  FOR SELECT
  USING (tenant_id = ANY(string_to_array(current_setting('app.tenant_ids'), ',')::uuid[]));
```

### NestJS Integration

Set the session variable in a Drizzle transaction wrapper or connection middleware before any queries execute:

```typescript
// In TenantInterceptor or a custom Drizzle middleware
await db.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
```

## Alternatives Considered

- **Application-layer only (current approach)** — simpler, but one missed filter = full breach. No safety net.
- **Schema-per-tenant** — strongest isolation, but unmanageable operationally at scale (dozens of schemas, migration complexity).
- **Separate databases per tenant** — maximum isolation, but connection pooling, operational burden, and cost make this impractical for the target market (small schools with low budgets).

## Consequences

### Positive
- Cross-tenant data leakage becomes impossible even if application code has bugs
- Defense-in-depth: two independent layers (app + DB) must both fail for a breach
- Performance impact is negligible (<1% overhead for simple equality checks on indexed UUID columns)
- Audit-friendly: RLS policies are declarative and inspectable

### Negative
- Additional complexity in connection management (must set session variable per request)
- Migrations require a superuser role that bypasses RLS
- Cross-tenant parent queries require special handling (multi-tenant policy)
- Debugging queries becomes slightly harder (must replicate session settings in dev tools)
- Testing must validate both application-level AND RLS-level filtering

## Trade-offs

Security and correctness are prioritized over developer convenience. The operational complexity is acceptable given that a single tenant isolation failure would be catastrophic for trust and potentially violate Indonesia's data protection regulations (UU PDP).
