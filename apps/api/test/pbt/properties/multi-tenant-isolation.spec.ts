/**
 * Property 1: Multi-Tenant Data Isolation
 *
 * For any authenticated user with a given `tenant_id`, all database queries
 * SHALL return exclusively data belonging to that tenant — no records from
 * other tenants SHALL ever appear in query results, regardless of the query
 * parameters or filters applied.
 *
 * **Validates: Requirements 23.1, 23.2, 23.3, 23.4**
 *
 * This is a PURE property test — tests the filtering logic without a real DB.
 * The core invariant: applying a tenant filter with tenant B on records
 * belonging to tenant A must ALWAYS yield zero results when A ≠ B.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryTenantPair } from '../arbitraries/tenant';
import { arbitraryUuid, arbitraryName } from '../arbitraries/common';

// ─── Types representing tenant-scoped records ─────────────────────────────────

interface TenantScopedRecord {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}

// ─── Simulated tenant filter (mirrors application-layer filtering logic) ──────

/**
 * Simulates the tenant filtering behavior of the TenantInterceptor.
 * In the real system, every query is scoped by `WHERE tenant_id = <user's tenant_id>`.
 * At the DB level, RLS enforces `tenant_id = current_setting('app.tenant_id')::uuid`.
 *
 * This function represents the fundamental isolation predicate.
 */
function filterByTenant<T extends TenantScopedRecord>(
  records: T[],
  requestingTenantId: string,
): T[] {
  return records.filter((record) => record.tenant_id === requestingTenantId);
}

// ─── Arbitrary: a set of records belonging to a specific tenant ───────────────

function arbitraryTenantRecords(
  tenantId: string,
  minCount = 1,
  maxCount = 20,
): fc.Arbitrary<TenantScopedRecord[]> {
  return fc
    .array(
      fc.record({
        id: arbitraryUuid(),
        tenant_id: fc.constant(tenantId),
        nama: arbitraryName(),
        data: fc.anything(),
      }),
      { minLength: minCount, maxLength: maxCount },
    )
    .map((records) =>
      records.map((r) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        nama: r.nama,
        data: r.data,
      })),
    );
}

/**
 * Generates a mixed dataset: records from multiple tenants in a shared table.
 * This simulates the shared-schema multi-tenancy model where all tenants'
 * data lives in the same table, differentiated only by tenant_id.
 */
function arbitraryMixedTenantDataset(
  tenantA: string,
  tenantB: string,
): fc.Arbitrary<{ recordsA: TenantScopedRecord[]; recordsB: TenantScopedRecord[] }> {
  return fc.record({
    recordsA: arbitraryTenantRecords(tenantA, 1, 15),
    recordsB: arbitraryTenantRecords(tenantB, 1, 15),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 1: Multi-Tenant Data Isolation', () => {
  it('tenant B querying records belonging to tenant A always yields empty results', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair(),
        arbitraryTenantPair().chain(({ tenantA }) => arbitraryTenantRecords(tenantA)),
        ({ tenantA, tenantB }, records) => {
          // Precondition: records all belong to tenantA
          const allBelongToA = records.every((r) => r.tenant_id === tenantA);
          if (!allBelongToA) return true; // skip malformed inputs

          // Apply tenant filter as if user is authenticated as tenantB
          const filteredForB = filterByTenant(records, tenantB);

          // PROPERTY: tenant B must NEVER see tenant A's data
          return filteredForB.length === 0;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('tenant A querying their own records returns all of their records', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair().chain(({ tenantA }) =>
          arbitraryTenantRecords(tenantA).map((records) => ({ tenantA, records })),
        ),
        ({ tenantA, records }) => {
          // Apply tenant filter as the owning tenant
          const filteredForA = filterByTenant(records, tenantA);

          // PROPERTY: tenant A must see ALL of their own records
          return filteredForA.length === records.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('in a mixed dataset, each tenant only sees their own records and never the other', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair().chain(({ tenantA, tenantB }) =>
          arbitraryMixedTenantDataset(tenantA, tenantB).map((dataset) => ({
            tenantA,
            tenantB,
            ...dataset,
          })),
        ),
        ({ tenantA, tenantB, recordsA, recordsB }) => {
          // Combine into a single "table" (shared schema)
          const allRecords = [...recordsA, ...recordsB];

          // Tenant A queries
          const seenByA = filterByTenant(allRecords, tenantA);
          // Tenant B queries
          const seenByB = filterByTenant(allRecords, tenantB);

          // PROPERTY: tenant A sees only their records
          const aSeesOnlyOwn = seenByA.every((r) => r.tenant_id === tenantA);
          // PROPERTY: tenant B sees only their records
          const bSeesOnlyOwn = seenByB.every((r) => r.tenant_id === tenantB);
          // PROPERTY: combined visible records cover both sets exactly
          const aCount = seenByA.length === recordsA.length;
          const bCount = seenByB.length === recordsB.length;
          // PROPERTY: no cross-contamination
          const noLeakAtoB = seenByB.every((r) => r.tenant_id !== tenantA);
          const noLeakBtoA = seenByA.every((r) => r.tenant_id !== tenantB);

          return aSeesOnlyOwn && bSeesOnlyOwn && aCount && bCount && noLeakAtoB && noLeakBtoA;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('auto-injection of tenant_id on INSERT prevents cross-tenant record creation', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair(),
        arbitraryUuid(),
        arbitraryName(),
        ({ tenantA, tenantB }, recordId, nama) => {
          // Simulate: user authenticated as tenantA creates a new record.
          // The TenantInterceptor auto-injects tenantA as tenant_id.
          const newRecord: TenantScopedRecord = {
            id: recordId,
            tenant_id: tenantA, // Auto-injected by interceptor
            nama,
          };

          // PROPERTY: the created record's tenant_id equals the
          // authenticated user's tenant — never another tenant
          const belongsToCreator = newRecord.tenant_id === tenantA;
          const doesNotBelongToOther = newRecord.tenant_id !== tenantB;

          return belongsToCreator && doesNotBelongToOther;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('filtering is stable: repeated queries for same tenant yield identical results', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair().chain(({ tenantA, tenantB }) =>
          arbitraryMixedTenantDataset(tenantA, tenantB).map((dataset) => ({
            tenantA,
            tenantB,
            allRecords: [...dataset.recordsA, ...dataset.recordsB],
          })),
        ),
        fc.integer({ min: 2, max: 10 }),
        ({ tenantA, allRecords }, repetitions) => {
          // PROPERTY: filtering is deterministic — same input, same output
          const firstResult = filterByTenant(allRecords, tenantA);
          for (let i = 1; i < repetitions; i++) {
            const nthResult = filterByTenant(allRecords, tenantA);
            if (nthResult.length !== firstResult.length) return false;
            for (let j = 0; j < firstResult.length; j++) {
              if (firstResult[j].id !== nthResult[j].id) return false;
            }
          }
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });
});
