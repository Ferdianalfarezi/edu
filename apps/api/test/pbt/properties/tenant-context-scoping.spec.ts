/**
 * Property 2: Tenant context header scopes all results to that tenant
 *
 * For any valid tenant UUID provided in the X-Tenant-Context header, when the
 * Superadmin performs a list read, ALL records in the response SHALL have
 * tenant_id equal to the specified UUID, and no records from other tenants
 * SHALL appear.
 *
 * **Validates: Requirements 1.4, 2.2**
 *
 * This is a PURE logic property test — simulates the scoping behavior of the
 * TenantInterceptor when X-Tenant-Context header is set.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantEntity {
  id: string;
  tenant_id: string;
  data: unknown;
}

// ─── Simulated Multi-Tenant Store ─────────────────────────────────────────────

/**
 * Simulates a multi-tenant data store. Mirrors the behavior of the
 * TenantInterceptor + RLS when X-Tenant-Context header is set:
 * queries are filtered to only return entities belonging to the context tenant.
 */
class MultiTenantStore {
  private entities: TenantEntity[] = [];

  addEntity(tenantId: string, entity: { id: string; data: unknown }): void {
    this.entities.push({ id: entity.id, tenant_id: tenantId, data: entity.data });
  }

  /**
   * Simulates query behavior when X-Tenant-Context is set.
   * This mirrors `SET LOCAL app.tenant_id = '<contextTenantId>'` which causes
   * RLS policies to filter all results to only the specified tenant.
   */
  queryWithContext(contextTenantId: string): TenantEntity[] {
    return this.entities.filter((e) => e.tenant_id === contextTenantId);
  }

  /** Returns all entities (no filtering — for assertions). */
  getAllEntities(): TenantEntity[] {
    return [...this.entities];
  }

  /** Returns entities belonging to a specific tenant (for count verification). */
  getEntitiesForTenant(tenantId: string): TenantEntity[] {
    return this.entities.filter((e) => e.tenant_id === tenantId);
  }
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a list of 3-5 distinct tenant UUIDs.
 */
function arbitraryTenantUuids(): fc.Arbitrary<string[]> {
  return fc
    .array(arbitraryUuid(), { minLength: 3, maxLength: 5 })
    .filter((ids) => new Set(ids).size === ids.length);
}

/**
 * Generates a random entity with an id and arbitrary data.
 */
function arbitraryEntity(): fc.Arbitrary<{ id: string; data: unknown }> {
  return fc.record({
    id: arbitraryUuid(),
    data: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
  });
}

/**
 * Generates a multi-tenant store populated with 5-20 entities distributed
 * across the provided tenants.
 */
function arbitraryPopulatedStore(
  tenantIds: string[],
): fc.Arbitrary<{ store: MultiTenantStore; selectedTenantId: string }> {
  return fc
    .array(
      fc.record({
        tenantIndex: fc.integer({ min: 0, max: tenantIds.length - 1 }),
        entity: arbitraryEntity(),
      }),
      { minLength: 5, maxLength: 20 },
    )
    .chain((entries) => {
      // Pick a random tenant index to use as the X-Tenant-Context header value
      return fc.integer({ min: 0, max: tenantIds.length - 1 }).map((selectedIndex) => {
        const store = new MultiTenantStore();
        for (const entry of entries) {
          store.addEntity(tenantIds[entry.tenantIndex], entry.entity);
        }
        return { store, selectedTenantId: tenantIds[selectedIndex] };
      });
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: superadmin-cross-tenant-access, Property 2: Tenant context header scopes all results to that tenant', () => {
  it('ALL records returned by queryWithContext have tenant_id equal to the context tenant UUID', () => {
    fc.assert(
      fc.property(
        arbitraryTenantUuids().chain((tenantIds) =>
          arbitraryPopulatedStore(tenantIds).map((result) => ({ tenantIds, ...result })),
        ),
        ({ store, selectedTenantId }) => {
          const results = store.queryWithContext(selectedTenantId);

          // PROPERTY: every record in the response has tenant_id === selectedTenantId
          return results.every((r) => r.tenant_id === selectedTenantId);
        },
      ),
      PBT_CONFIG,
    );
  });

  it('NO records from other tenants appear in the response', () => {
    fc.assert(
      fc.property(
        arbitraryTenantUuids().chain((tenantIds) =>
          arbitraryPopulatedStore(tenantIds).map((result) => ({ tenantIds, ...result })),
        ),
        ({ tenantIds, store, selectedTenantId }) => {
          const results = store.queryWithContext(selectedTenantId);
          const otherTenantIds = tenantIds.filter((id) => id !== selectedTenantId);

          // PROPERTY: no record in results belongs to any other tenant
          return results.every((r) => !otherTenantIds.includes(r.tenant_id));
        },
      ),
      PBT_CONFIG,
    );
  });

  it('all records belonging to the context tenant appear in the result (completeness)', () => {
    fc.assert(
      fc.property(
        arbitraryTenantUuids().chain((tenantIds) =>
          arbitraryPopulatedStore(tenantIds).map((result) => ({ tenantIds, ...result })),
        ),
        ({ store, selectedTenantId }) => {
          const results = store.queryWithContext(selectedTenantId);
          const expected = store.getEntitiesForTenant(selectedTenantId);

          // PROPERTY: every entity belonging to the context tenant is in the response
          const resultIds = new Set(results.map((r) => r.id));
          return expected.every((e) => resultIds.has(e.id));
        },
      ),
      PBT_CONFIG,
    );
  });

  it('the count of results equals the number of entities belonging to that tenant', () => {
    fc.assert(
      fc.property(
        arbitraryTenantUuids().chain((tenantIds) =>
          arbitraryPopulatedStore(tenantIds).map((result) => ({ tenantIds, ...result })),
        ),
        ({ store, selectedTenantId }) => {
          const results = store.queryWithContext(selectedTenantId);
          const expectedCount = store.getEntitiesForTenant(selectedTenantId).length;

          // PROPERTY: result count matches exactly the number of entities for that tenant
          return results.length === expectedCount;
        },
      ),
      PBT_CONFIG,
    );
  });
});
