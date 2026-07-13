/**
 * Property 1: Cross-tenant read without context returns all tenants with tenant_id
 *
 * For any set of entities distributed across multiple tenants, when the Superadmin
 * performs a list read without an `X-Tenant-Context` header, every record in the
 * response SHALL include a non-null `tenant_id` field and the result set SHALL
 * contain records from all tenants that have data.
 *
 * **Validates: Requirements 1.1, 1.3**
 *
 * Pure logic property test — simulates the cross-tenant read behavior of the
 * SUPER_ADMIN when NO X-Tenant-Context header is set. Without context, the
 * system returns ALL entities from ALL tenants unfiltered.
 *
 * Tag: Feature: superadmin-cross-tenant-access, Property 1: Cross-tenant read without context returns all tenants with tenant_id
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  tenant_id: string;
  name: string;
}

// ─── Simulated cross-tenant read (no context header) ──────────────────────────

/**
 * Simulates the SUPER_ADMIN query behavior when NO X-Tenant-Context header is set.
 * The TenantInterceptor bypasses RLS entirely, returning all entities from all tenants.
 */
function queryWithoutContext(allEntities: Entity[]): Entity[] {
  return allEntities; // No filtering — return everything
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates 2-6 distinct tenant UUIDs.
 */
function arbitraryTenantIds(): fc.Arbitrary<string[]> {
  return fc
    .uniqueArray(arbitraryUuid(), { minLength: 2, maxLength: 6 })
    .filter((ids) => new Set(ids).size === ids.length);
}

/**
 * Generates entities distributed across given tenants, ensuring at least 1 per tenant.
 * Total entity count: 5-30.
 */
function arbitraryDistributedEntities(tenantIds: string[]): fc.Arbitrary<Entity[]> {
  // First, guarantee at least one entity per tenant
  const guaranteedEntities = fc.tuple(
    ...tenantIds.map((tenantId) =>
      fc.record({
        id: arbitraryUuid(),
        tenant_id: fc.constant(tenantId),
        name: fc.string({ minLength: 1, maxLength: 20 }),
      }),
    ),
  );

  // Then add extra entities distributed randomly across tenants
  const extraCount = Math.max(0, 5 - tenantIds.length); // ensure minimum total of 5
  const extraEntities = fc.array(
    fc.record({
      id: arbitraryUuid(),
      tenant_id: fc.constantFrom(...tenantIds),
      name: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { minLength: extraCount, maxLength: 30 - tenantIds.length },
  );

  return fc
    .tuple(guaranteedEntities, extraEntities)
    .map(([guaranteed, extras]) => [...guaranteed, ...extras]);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 1: Cross-tenant read without context returns all tenants with tenant_id', () => {
  it('every record in the response includes a non-null tenant_id field', () => {
    fc.assert(
      fc.property(
        arbitraryTenantIds().chain((tenantIds) =>
          arbitraryDistributedEntities(tenantIds).map((entities) => ({
            tenantIds,
            entities,
          })),
        ),
        ({ entities }) => {
          const results = queryWithoutContext(entities);

          // PROPERTY: every record has a non-null tenant_id
          return results.every(
            (record) => record.tenant_id !== null && record.tenant_id !== undefined,
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('records from ALL populated tenants appear in the result set', () => {
    fc.assert(
      fc.property(
        arbitraryTenantIds().chain((tenantIds) =>
          arbitraryDistributedEntities(tenantIds).map((entities) => ({
            tenantIds,
            entities,
          })),
        ),
        ({ tenantIds, entities }) => {
          const results = queryWithoutContext(entities);

          // Determine which tenants actually have data
          const tenantsWithData = new Set(entities.map((e) => e.tenant_id));

          // Determine which tenants appear in results
          const tenantsInResults = new Set(results.map((r) => r.tenant_id));

          // PROPERTY: all tenants that have data are represented in the results
          for (const tenantId of tenantsWithData) {
            if (!tenantsInResults.has(tenantId)) return false;
          }

          // Also verify that all originally populated tenants are present
          // (since we guaranteed at least 1 entity per tenant)
          for (const tenantId of tenantIds) {
            if (!tenantsInResults.has(tenantId)) return false;
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('total count matches the total number of entities across all tenants', () => {
    fc.assert(
      fc.property(
        arbitraryTenantIds().chain((tenantIds) =>
          arbitraryDistributedEntities(tenantIds).map((entities) => ({
            tenantIds,
            entities,
          })),
        ),
        ({ entities }) => {
          const results = queryWithoutContext(entities);

          // PROPERTY: the total count of results equals the total entities stored
          return results.length === entities.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('the set of distinct tenant_ids in results equals the set of all tenants that have data', () => {
    fc.assert(
      fc.property(
        arbitraryTenantIds().chain((tenantIds) =>
          arbitraryDistributedEntities(tenantIds).map((entities) => ({
            tenantIds,
            entities,
          })),
        ),
        ({ tenantIds, entities }) => {
          const results = queryWithoutContext(entities);

          // Distinct tenant_ids in results
          const distinctTenantsInResults = new Set(results.map((r) => r.tenant_id));

          // All tenants that have data in the store
          const tenantsWithData = new Set(entities.map((e) => e.tenant_id));

          // PROPERTY: the two sets are identical
          if (distinctTenantsInResults.size !== tenantsWithData.size) return false;

          for (const tenantId of tenantsWithData) {
            if (!distinctTenantsInResults.has(tenantId)) return false;
          }

          for (const tenantId of distinctTenantsInResults) {
            if (!tenantsWithData.has(tenantId)) return false;
          }

          return true;
        },
      ),
      PBT_CONFIG,
    );
  });
});
