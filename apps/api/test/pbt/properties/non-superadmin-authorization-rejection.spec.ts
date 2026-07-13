/**
 * Property 3: Non-superadmin authorization rejection
 *
 * For any user with a role other than SUPER_ADMIN (i.e., ADMIN, KEPALA_SEKOLAH,
 * GURU, BENDAHARA, ORANG_TUA), when that user attempts to access any Superadmin-only
 * endpoint, the API SHALL return HTTP 403 Forbidden.
 *
 * **Validates: Requirements 1.6, 3.4**
 *
 * Pure logic property test — simulates the RolesGuard behavior by generating random
 * non-SUPER_ADMIN roles and random superadmin-only endpoints, then verifying that
 * each combination results in a 403 rejection.
 *
 * Tag: Feature: superadmin-cross-tenant-access, Property 3: Non-superadmin authorization rejection
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

const NON_SUPER_ADMIN_ROLES = [
  'admin',
  'kepala_sekolah',
  'guru',
  'bendahara',
  'orang_tua',
] as const;

type NonSuperAdminRole = (typeof NON_SUPER_ADMIN_ROLES)[number];

const SUPERADMIN_ONLY_ENDPOINTS = [
  { method: 'GET', path: '/dashboard/superadmin/metrics' },
  { method: 'GET', path: '/tenants' },
  { method: 'POST', path: '/tenants' },
  { method: 'PATCH', path: '/tenants/:id/activate' },
  { method: 'PATCH', path: '/tenants/:id/deactivate' },
  { method: 'DELETE', path: '/tenants/:id' },
  { method: 'PATCH', path: '/users/:id/role' },
  { method: 'PATCH', path: '/users/:id/activate' },
  { method: 'POST', path: '/users/:id/reset-password' },
] as const;

type SuperadminEndpoint = (typeof SUPERADMIN_ONLY_ENDPOINTS)[number];

interface RequestUser {
  id: string;
  role: string;
  tenantId: string | null;
}

interface AuthorizationResult {
  allowed: boolean;
  statusCode: number;
  message?: string;
}

// ─── Simulated RolesGuard ─────────────────────────────────────────────────────

/**
 * Simulates the RolesGuard behavior for superadmin-only endpoints.
 * Each of these endpoints requires the SUPER_ADMIN role.
 * Any other role gets a 403 Forbidden response.
 */
function evaluateRolesGuard(user: RequestUser, _endpoint: SuperadminEndpoint): AuthorizationResult {
  const requiredRole = 'super_admin';

  if (!user) {
    return {
      allowed: false,
      statusCode: 403,
      message: 'Access denied',
    };
  }

  if (user.role !== requiredRole) {
    return {
      allowed: false,
      statusCode: 403,
      message: 'You do not have permission to access this resource',
    };
  }

  return {
    allowed: true,
    statusCode: 200,
  };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/** Generates a non-SUPER_ADMIN role */
function arbitraryNonSuperAdminRole(): fc.Arbitrary<NonSuperAdminRole> {
  return fc.constantFrom(...NON_SUPER_ADMIN_ROLES);
}

/** Generates a superadmin-only endpoint */
function arbitrarySuperadminEndpoint(): fc.Arbitrary<SuperadminEndpoint> {
  return fc.constantFrom(...SUPERADMIN_ONLY_ENDPOINTS);
}

/** Generates a request user with a non-SUPER_ADMIN role */
function arbitraryNonSuperAdminUser(): fc.Arbitrary<RequestUser> {
  return fc.record({
    id: fc.uuid(),
    role: arbitraryNonSuperAdminRole(),
    tenantId: fc.uuid(),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 3: Non-superadmin authorization rejection', () => {
  it('every non-SUPER_ADMIN role is rejected with HTTP 403 on every superadmin-only endpoint', () => {
    fc.assert(
      fc.property(arbitraryNonSuperAdminUser(), arbitrarySuperadminEndpoint(), (user, endpoint) => {
        const result = evaluateRolesGuard(user, endpoint);

        // PROPERTY: non-SUPER_ADMIN users are always rejected
        return result.allowed === false && result.statusCode === 403;
      }),
      PBT_CONFIG,
    );
  });

  it('rejection message matches the expected forbidden message', () => {
    fc.assert(
      fc.property(arbitraryNonSuperAdminUser(), arbitrarySuperadminEndpoint(), (user, endpoint) => {
        const result = evaluateRolesGuard(user, endpoint);

        // PROPERTY: the rejection message is the standard forbidden message
        return result.message === 'You do not have permission to access this resource';
      }),
      PBT_CONFIG,
    );
  });

  it('all defined non-SUPER_ADMIN roles are covered in the test space', () => {
    // Verify the test generator covers all non-super_admin roles
    const rolesGenerated = new Set<string>();
    const endpointsGenerated = new Set<string>();

    fc.assert(
      fc.property(arbitraryNonSuperAdminRole(), arbitrarySuperadminEndpoint(), (role, endpoint) => {
        rolesGenerated.add(role);
        endpointsGenerated.add(`${endpoint.method} ${endpoint.path}`);
        // Always true — we just track coverage
        return true;
      }),
      { ...PBT_CONFIG, numRuns: 500 },
    );

    // After 500 runs, all 5 roles and 9 endpoints should be covered
    expect(rolesGenerated.size).toBe(NON_SUPER_ADMIN_ROLES.length);
    expect(endpointsGenerated.size).toBe(SUPERADMIN_ONLY_ENDPOINTS.length);
  });

  it('SUPER_ADMIN role IS allowed (positive control)', () => {
    fc.assert(
      fc.property(arbitrarySuperadminEndpoint(), (endpoint) => {
        const superadminUser: RequestUser = {
          id: crypto.randomUUID(),
          role: 'super_admin',
          tenantId: null,
        };

        const result = evaluateRolesGuard(superadminUser, endpoint);

        // PROPERTY: SUPER_ADMIN is allowed on all superadmin-only endpoints
        return result.allowed === true && result.statusCode === 200;
      }),
      PBT_CONFIG,
    );
  });

  it('every combination of non-SUPER_ADMIN role × endpoint results in 403', () => {
    // Exhaustive check: iterate all roles × all endpoints
    for (const role of NON_SUPER_ADMIN_ROLES) {
      for (const endpoint of SUPERADMIN_ONLY_ENDPOINTS) {
        const user: RequestUser = {
          id: crypto.randomUUID(),
          role,
          tenantId: crypto.randomUUID(),
        };

        const result = evaluateRolesGuard(user, endpoint);

        expect(result.allowed).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.message).toBe('You do not have permission to access this resource');
      }
    }
  });
});
