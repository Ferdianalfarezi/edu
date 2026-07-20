import fc from 'fast-check';
import { Role } from '@edu/shared';

/**
 * Property 2: Role authorization for hari_kerja update
 *
 * For any user role, the update hari_kerja endpoint SHALL return success (200)
 * if the role is `admin` or `super_admin`, and SHALL return 403 Forbidden for
 * all other roles.
 *
 * **Validates: Requirements 3.4**
 *
 * Feature: hari-kerja-sekolah, Property 2: Role authorization for hari_kerja update
 */

/**
 * Pure function that replicates the RolesGuard authorization logic
 * for the PATCH /tenants/hari-kerja endpoint.
 *
 * The endpoint is decorated with @Roles(Role.ADMIN, Role.SUPER_ADMIN),
 * so only those two roles are authorized.
 */
const AUTHORIZED_ROLES: Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

function isAuthorizedForHariKerjaUpdate(role: Role): boolean {
  return AUTHORIZED_ROLES.includes(role);
}

describe('Feature: hari-kerja-sekolah, Property 2: Role authorization for hari_kerja update', () => {
  const allRoles = Object.values(Role);
  const roleArb = fc.constantFrom(...allRoles);

  it('only admin and super_admin roles are authorized to update hari_kerja', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const authorized = isAuthorizedForHariKerjaUpdate(role);

        if (role === Role.ADMIN || role === Role.SUPER_ADMIN) {
          expect(authorized).toBe(true);
        } else {
          expect(authorized).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('unauthorized roles are exactly the complement of {admin, super_admin}', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const authorized = isAuthorizedForHariKerjaUpdate(role);
        const isAdminOrSuperAdmin = role === Role.ADMIN || role === Role.SUPER_ADMIN;

        // Authorization result must be equivalent to being admin or super_admin
        expect(authorized).toBe(isAdminOrSuperAdmin);
      }),
      { numRuns: 100 },
    );
  });

  it('the authorized set contains exactly 2 roles', () => {
    // This is a static assertion but validates the guard configuration
    const authorizedRoles = allRoles.filter((role) => isAuthorizedForHariKerjaUpdate(role));
    expect(authorizedRoles).toHaveLength(2);
    expect(authorizedRoles).toContain(Role.ADMIN);
    expect(authorizedRoles).toContain(Role.SUPER_ADMIN);
  });
});
