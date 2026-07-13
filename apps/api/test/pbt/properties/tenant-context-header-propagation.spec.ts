/**
 * Property 13: Tenant context header propagation from frontend
 *
 * For any active tenant context in the Pinia store (non-null activeTenant),
 * every API request made by the axios instance SHALL include an X-Tenant-Context
 * header with the value equal to activeTenant.id. When activeTenant is null,
 * no X-Tenant-Context header SHALL be present.
 *
 * **Validates: Requirements 2.1, 2.4**
 *
 * This is a PURE logic property test — simulates the axios interceptor's behavior
 * of reading tenant context state and applying/omitting the X-Tenant-Context header.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitraryName } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantContext {
  id: string;
  nama: string;
}

interface RequestHeaders {
  [key: string]: string | undefined;
}

interface RequestConfig {
  url: string;
  method: string;
  headers: RequestHeaders;
}

// ─── Simulated Tenant Context Store ───────────────────────────────────────────

/**
 * Simulates the Pinia tenant-context store state.
 * In the real app this is useTenantContextStore().activeTenant.
 */
class TenantContextStore {
  private _activeTenant: TenantContext | null = null;

  get activeTenant(): TenantContext | null {
    return this._activeTenant;
  }

  get hasTenantContext(): boolean {
    return this._activeTenant !== null;
  }

  setTenant(tenant: TenantContext): void {
    this._activeTenant = tenant;
  }

  clearTenant(): void {
    this._activeTenant = null;
  }
}

// ─── Simulated Axios Request Interceptor ──────────────────────────────────────

/**
 * Simulates the axios request interceptor logic from apps/admin/src/api/client.ts.
 * This mirrors:
 *   api.interceptors.request.use((config) => {
 *     const tenantContext = useTenantContextStore();
 *     if (tenantContext.activeTenant) {
 *       config.headers['X-Tenant-Context'] = tenantContext.activeTenant.id;
 *     }
 *     return config;
 *   });
 */
function applyTenantContextInterceptor(
  config: RequestConfig,
  store: TenantContextStore,
): RequestConfig {
  if (store.activeTenant) {
    config.headers['X-Tenant-Context'] = store.activeTenant.id;
  }
  return config;
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a random tenant context state: either null or a valid {id, nama} object.
 */
function arbitraryTenantContextState(): fc.Arbitrary<TenantContext | null> {
  return fc.oneof(
    fc.constant(null),
    fc.record({
      id: arbitraryUuid(),
      nama: arbitraryName(),
    }),
  );
}

/**
 * Generates a random request config simulating outgoing API requests.
 */
function arbitraryRequestConfig(): fc.Arbitrary<RequestConfig> {
  return fc.record({
    url: fc.constantFrom(
      '/users',
      '/tenants',
      '/audit-logs',
      '/dashboard/superadmin/metrics',
      '/tagihan',
      '/pembayaran',
      '/auth/refresh',
    ),
    method: fc.constantFrom('GET', 'POST', 'PATCH', 'DELETE'),
    headers: fc.constant({ 'Content-Type': 'application/json' } as RequestHeaders),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: superadmin-cross-tenant-access, Property 13: Tenant context header propagation from frontend', () => {
  it('X-Tenant-Context header is present with correct value when store has active tenant', () => {
    fc.assert(
      fc.property(
        fc.record({ id: arbitraryUuid(), nama: arbitraryName() }),
        arbitraryRequestConfig(),
        (tenant, config) => {
          const store = new TenantContextStore();
          store.setTenant(tenant);

          const result = applyTenantContextInterceptor(
            { ...config, headers: { ...config.headers } },
            store,
          );

          // PROPERTY: header is present and equals the tenant id
          return result.headers['X-Tenant-Context'] === tenant.id;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('X-Tenant-Context header is absent when store has no active tenant (null)', () => {
    fc.assert(
      fc.property(arbitraryRequestConfig(), (config) => {
        const store = new TenantContextStore();
        // Store starts with null activeTenant

        const result = applyTenantContextInterceptor(
          { ...config, headers: { ...config.headers } },
          store,
        );

        // PROPERTY: header is NOT present when activeTenant is null
        return result.headers['X-Tenant-Context'] === undefined;
      }),
      PBT_CONFIG,
    );
  });

  it('header presence/absence matches store state for arbitrary state transitions', () => {
    fc.assert(
      fc.property(
        arbitraryTenantContextState(),
        arbitraryRequestConfig(),
        (tenantState, config) => {
          const store = new TenantContextStore();
          if (tenantState) {
            store.setTenant(tenantState);
          }
          // else store remains with null activeTenant

          const result = applyTenantContextInterceptor(
            { ...config, headers: { ...config.headers } },
            store,
          );

          if (tenantState !== null) {
            // Store has active tenant → header must be present with correct value
            return result.headers['X-Tenant-Context'] === tenantState.id;
          } else {
            // Store has no tenant → header must be absent
            return result.headers['X-Tenant-Context'] === undefined;
          }
        },
      ),
      PBT_CONFIG,
    );
  });

  it('clearing tenant context removes the header from subsequent requests', () => {
    fc.assert(
      fc.property(
        fc.record({ id: arbitraryUuid(), nama: arbitraryName() }),
        arbitraryRequestConfig(),
        arbitraryRequestConfig(),
        (tenant, configBefore, configAfter) => {
          const store = new TenantContextStore();

          // Set tenant → header should be present
          store.setTenant(tenant);
          const resultBefore = applyTenantContextInterceptor(
            { ...configBefore, headers: { ...configBefore.headers } },
            store,
          );
          const headerPresent = resultBefore.headers['X-Tenant-Context'] === tenant.id;

          // Clear tenant → header should be absent
          store.clearTenant();
          const resultAfter = applyTenantContextInterceptor(
            { ...configAfter, headers: { ...configAfter.headers } },
            store,
          );
          const headerAbsent = resultAfter.headers['X-Tenant-Context'] === undefined;

          return headerPresent && headerAbsent;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('switching tenant context updates the header value to new tenant id', () => {
    fc.assert(
      fc.property(
        fc.record({ id: arbitraryUuid(), nama: arbitraryName() }),
        fc.record({ id: arbitraryUuid(), nama: arbitraryName() }),
        arbitraryRequestConfig(),
        arbitraryRequestConfig(),
        (tenantA, tenantB, configFirst, configSecond) => {
          const store = new TenantContextStore();

          // Set tenant A → header should be A's id
          store.setTenant(tenantA);
          const resultFirst = applyTenantContextInterceptor(
            { ...configFirst, headers: { ...configFirst.headers } },
            store,
          );
          const headerMatchesA = resultFirst.headers['X-Tenant-Context'] === tenantA.id;

          // Switch to tenant B → header should be B's id
          store.setTenant(tenantB);
          const resultSecond = applyTenantContextInterceptor(
            { ...configSecond, headers: { ...configSecond.headers } },
            store,
          );
          const headerMatchesB = resultSecond.headers['X-Tenant-Context'] === tenantB.id;

          return headerMatchesA && headerMatchesB;
        },
      ),
      PBT_CONFIG,
    );
  });
});
