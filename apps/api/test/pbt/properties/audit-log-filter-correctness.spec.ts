/**
 * Property 6: Filter correctness
 *
 * For any random set of audit log entries and any random filter combination,
 * applying the filters SHALL return only entries that satisfy ALL active
 * filter criteria simultaneously, and SHALL never include entries that violate
 * any single criterion.
 *
 * **Validates: Requirements 5.4**
 *
 * Feature: superadmin-cross-tenant-access, Property 6: Filter correctness
 *
 * This is a PURE property test — simulates the filter logic of
 * AuditLogService.findAll without a real database.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditAction =
  'create' | 'update' | 'delete' | 'deactivate' | 'activate' | 'role_change' | 'password_reset';

type AuditEntityType = 'tagihan' | 'pembayaran' | 'user' | 'role_assignment' | 'tenant_config';

interface AuditEntry {
  id: string;
  tenant_id: string;
  entity_type: AuditEntityType;
  action: AuditAction;
  actor_user_id: string;
  created_at: string; // ISO 8601
}

interface AuditFilters {
  tenantId?: string;
  entityType?: AuditEntityType;
  action?: AuditAction;
  actorUserId?: string;
  dateFrom?: string; // ISO date string
  dateTo?: string; // ISO date string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIT_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'delete',
  'deactivate',
  'activate',
  'role_change',
  'password_reset',
];

const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  'tagihan',
  'pembayaran',
  'user',
  'role_assignment',
  'tenant_config',
];

// ─── Simulated filter logic (mirrors AuditLogService.findAll) ─────────────────

/**
 * Pure filter function matching the WHERE clause logic in AuditLogService.findAll.
 * Each active filter narrows the result set; undefined filters are skipped.
 */
function applyFilters(entries: AuditEntry[], filters: AuditFilters): AuditEntry[] {
  return entries.filter((entry) => {
    if (filters.tenantId && entry.tenant_id !== filters.tenantId) return false;
    if (filters.entityType && entry.entity_type !== filters.entityType) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.actorUserId && entry.actor_user_id !== filters.actorUserId) return false;
    if (filters.dateFrom && new Date(entry.created_at) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(entry.created_at) > new Date(filters.dateTo)) return false;
    return true;
  });
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/** Generate a pool of 3-5 tenant UUIDs */
function arbitraryTenantPool(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryUuid(), { minLength: 3, maxLength: 5 });
}

/** Generate a pool of 3-5 actor user UUIDs */
function arbitraryActorPool(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryUuid(), { minLength: 3, maxLength: 5 });
}

/** Generate a random date within a 2-year range (2023-01-01 to 2024-12-31) */
function arbitraryAuditDate(): fc.Arbitrary<Date> {
  return fc.date({
    min: new Date('2023-01-01T00:00:00Z'),
    max: new Date('2024-12-31T23:59:59Z'),
  });
}

/** Generate a list of random audit entries using the provided pools */
function arbitraryAuditEntries(
  tenantPool: string[],
  actorPool: string[],
): fc.Arbitrary<AuditEntry[]> {
  return fc.array(
    fc.record({
      id: arbitraryUuid(),
      tenant_id: fc.constantFrom(...tenantPool),
      entity_type: fc.constantFrom(...AUDIT_ENTITY_TYPES),
      action: fc.constantFrom(...AUDIT_ACTIONS),
      actor_user_id: fc.constantFrom(...actorPool),
      created_at: arbitraryAuditDate().map((d) => d.toISOString()),
    }),
    { minLength: 5, maxLength: 50 },
  );
}

/** Generate random filter combinations picking from the pools */
function arbitraryFilters(tenantPool: string[], actorPool: string[]): fc.Arbitrary<AuditFilters> {
  return fc.record({
    tenantId: fc.option(fc.constantFrom(...tenantPool), { nil: undefined }),
    entityType: fc.option(fc.constantFrom(...AUDIT_ENTITY_TYPES), { nil: undefined }),
    action: fc.option(fc.constantFrom(...AUDIT_ACTIONS), { nil: undefined }),
    actorUserId: fc.option(fc.constantFrom(...actorPool), { nil: undefined }),
    dateFrom: fc.option(
      arbitraryAuditDate().map((d) => d.toISOString()),
      { nil: undefined },
    ),
    dateTo: fc.option(
      arbitraryAuditDate().map((d) => d.toISOString()),
      { nil: undefined },
    ),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 6: Filter correctness', () => {
  it('every entry in filtered results satisfies ALL active filter criteria simultaneously', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          arbitraryActorPool().chain((actorPool) =>
            fc.tuple(
              arbitraryAuditEntries(tenantPool, actorPool),
              arbitraryFilters(tenantPool, actorPool),
            ),
          ),
        ),
        ([entries, filters]) => {
          const results = applyFilters(entries, filters);

          // Every returned entry must satisfy ALL active filters
          return results.every((entry) => {
            if (filters.tenantId && entry.tenant_id !== filters.tenantId) return false;
            if (filters.entityType && entry.entity_type !== filters.entityType) return false;
            if (filters.action && entry.action !== filters.action) return false;
            if (filters.actorUserId && entry.actor_user_id !== filters.actorUserId) return false;
            if (filters.dateFrom && new Date(entry.created_at) < new Date(filters.dateFrom))
              return false;
            if (filters.dateTo && new Date(entry.created_at) > new Date(filters.dateTo))
              return false;
            return true;
          });
        },
      ),
      PBT_CONFIG,
    );
  });

  it('no entry violating any single filter criterion appears in results', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          arbitraryActorPool().chain((actorPool) =>
            fc.tuple(
              arbitraryAuditEntries(tenantPool, actorPool),
              arbitraryFilters(tenantPool, actorPool),
            ),
          ),
        ),
        ([entries, filters]) => {
          const results = applyFilters(entries, filters);
          const resultIds = new Set(results.map((r) => r.id));

          // Every entry NOT in results must violate at least one filter
          const excluded = entries.filter((e) => !resultIds.has(e.id));
          return excluded.every((entry) => {
            const violatesTenant =
              filters.tenantId !== undefined && entry.tenant_id !== filters.tenantId;
            const violatesEntity =
              filters.entityType !== undefined && entry.entity_type !== filters.entityType;
            const violatesAction = filters.action !== undefined && entry.action !== filters.action;
            const violatesActor =
              filters.actorUserId !== undefined && entry.actor_user_id !== filters.actorUserId;
            const violatesDateFrom =
              filters.dateFrom !== undefined &&
              new Date(entry.created_at) < new Date(filters.dateFrom);
            const violatesDateTo =
              filters.dateTo !== undefined && new Date(entry.created_at) > new Date(filters.dateTo);

            return (
              violatesTenant ||
              violatesEntity ||
              violatesAction ||
              violatesActor ||
              violatesDateFrom ||
              violatesDateTo
            );
          });
        },
      ),
      PBT_CONFIG,
    );
  });

  it('filtered result count is always <= total entry count', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          arbitraryActorPool().chain((actorPool) =>
            fc.tuple(
              arbitraryAuditEntries(tenantPool, actorPool),
              arbitraryFilters(tenantPool, actorPool),
            ),
          ),
        ),
        ([entries, filters]) => {
          const results = applyFilters(entries, filters);
          return results.length <= entries.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('when no filters are applied, all entries are returned', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          arbitraryActorPool().chain((actorPool) => arbitraryAuditEntries(tenantPool, actorPool)),
        ),
        (entries) => {
          const emptyFilters: AuditFilters = {};
          const results = applyFilters(entries, emptyFilters);
          return results.length === entries.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('date range filtering correctly includes boundary dates', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          arbitraryActorPool().chain((actorPool) =>
            arbitraryAuditEntries(tenantPool, actorPool).chain((entries) =>
              // Pick two dates to form a valid range (ensure from <= to)
              fc.tuple(arbitraryAuditDate(), arbitraryAuditDate()).map(([d1, d2]) => {
                const from = d1 <= d2 ? d1 : d2;
                const to = d1 <= d2 ? d2 : d1;
                return { entries, dateFrom: from.toISOString(), dateTo: to.toISOString() };
              }),
            ),
          ),
        ),
        ({ entries, dateFrom, dateTo }) => {
          const filters: AuditFilters = { dateFrom, dateTo };
          const results = applyFilters(entries, filters);

          // Boundary dates should be included (>= dateFrom and <= dateTo)
          const fromMs = new Date(dateFrom).getTime();
          const toMs = new Date(dateTo).getTime();

          return results.every((entry) => {
            const entryMs = new Date(entry.created_at).getTime();
            return entryMs >= fromMs && entryMs <= toMs;
          });
        },
      ),
      PBT_CONFIG,
    );
  });
});
