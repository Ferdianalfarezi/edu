# ADR-002: Parent (Orang Tua) User Model — Single Record with NULL tenant_id

## Status

Proposed

## Context

Parents can have children across multiple schools (tenants). The current design has ambiguity:
- The `user` table has a single `tenant_id` column (NULL for super_admin)
- The JWT contains a `tenants[]` array for cross-tenant parents
- But the schema doesn't clearly define whether a parent gets one user record or one per tenant

This ambiguity affects:
- Token invalidation (which records to update when phone changes?)
- Notification preferences (stored per user_id + siswa_id — which user_id?)
- Device tokens (tied to user_id — one record or many?)
- Login resolution (query which table/user to authenticate?)

## Decision

Parents (`orang_tua`) will have a **single user record with `tenant_id = NULL`**, similar to `super_admin`. Tenant association is derived from their children's enrollment, not from the user record itself.

### Data Model

```sql
-- Parent user: tenant_id IS NULL
-- Association is through siswa.orang_tua_id (cross-tenant FK)
INSERT INTO "user" (nama, phone, role, tenant_id) 
VALUES ('Ibu Sari', '081234567890', 'orang_tua', NULL);
```

### Login Resolution

```sql
-- On parent login by phone:
SELECT u.id, u.nama, u.phone,
       array_agg(DISTINCT s.tenant_id) as accessible_tenants
FROM "user" u
JOIN siswa s ON s.orang_tua_id = u.id
WHERE u.phone = $1 
  AND u.role = 'orang_tua'
  AND s.status = 'aktif'
GROUP BY u.id;
```

### JWT Payload

```typescript
{
  sub: "parent-user-uuid",
  role: "orang_tua",
  tenant_id: null,           // No home tenant
  tenants: ["school-a-uuid", "school-b-uuid"],  // Derived from active children
  platform: "mobile"
}
```

### Consequences for RLS (ADR-001)

Parent queries must use the multi-tenant RLS policy from ADR-001. The application sets `app.tenant_ids` (plural) for parent sessions instead of `app.tenant_id`.

### Notification Preferences

Stored as `(user_id, siswa_id)` — since user_id is globally unique for parents, this works correctly across tenants without additional tenant scoping.

### Token Invalidation

Single user record = single point of invalidation. When admin updates a parent's phone number, invalidate tokens for exactly one user_id.

### Data Deduplication

When a parent is registered at School A with phone `081234567890`, and later School B's admin registers the same phone:
1. System checks: does a `user` with this phone and role `orang_tua` already exist?
2. If yes: link the new `siswa` record to the existing user (set `siswa.orang_tua_id`)
3. If no: create new user record

This means bulk onboarding (CSV import) must check for existing parent records globally, not just within the current tenant.

## Alternatives Considered

- **One user record per tenant** — simpler isolation, but causes: duplicate device tokens, inconsistent preferences, complex phone-change propagation across N records, parent sees N separate "accounts" conceptually.
- **Parent in a separate `parent` table** — cleaner separation but adds schema complexity, requires different auth logic, and breaks the single `user` table approach used everywhere else.

## Consequences

### Positive
- Clean single-source-of-truth for parent identity
- Phone number change is atomic (one record)
- Device tokens, preferences, and notification history are cleanly tied to one identity
- Cross-tenant view works naturally (JWT lists all accessible tenants)

### Negative
- RLS policies need special handling for NULL tenant_id users
- Bulk import must do global phone lookups (cross-tenant query during import)
- Parent user records are "homeless" — no single school owns them
- If both schools deactivate all children, the parent user record remains orphaned (need cleanup logic)
- Admin at School A can see that a parent exists (phone registered) but cannot see data from School B

## Trade-offs

Identity simplicity and data consistency are prioritized over strict tenant isolation for the parent role. This is acceptable because parents inherently span tenants by definition — forcing them into a single-tenant model creates artificial complexity.
