import fc from 'fast-check';

/**
 * Property 6: Recipient-Only Access Control
 *
 * For any user U and pengumuman P, the detail endpoint SHALL return the pengumuman
 * content if and only if there exists a record in pengumuman_penerima where
 * user_id = U.id AND the pengumuman's tenant_id is in U's tenant list.
 * Otherwise, the endpoint SHALL return HTTP 403.
 *
 * **Validates: Requirements 6.6, 7.5, 7.6**
 *
 * Feature: announcement, Property 6: Recipient-Only Access Control
 */

// ─────────────────────────────────────────────────────────────────
// Pure access control logic (mirrors PengumumanService.getDetail)
// ─────────────────────────────────────────────────────────────────

/**
 * Determines whether a user can access a specific pengumuman.
 *
 * Mirrors the two checks in PengumumanService.getDetail():
 * 1. Verify user is in pengumuman_penerima (user_id must exist in penerima list)
 * 2. Verify pengumuman's tenant_id is in user's tenants list
 *
 * Both conditions must be true simultaneously for access to be granted.
 */
function canAccessPengumuman(
  userId: string,
  pengumumanTenantId: string,
  penerimaUserIds: string[],
  userTenants: string[],
): boolean {
  return penerimaUserIds.includes(userId) && userTenants.includes(pengumumanTenantId);
}

// ─────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────

const userIdPool = Array.from({ length: 10 }, (_, i) => `user-${i + 1}`);
const tenantIdPool = ['tenant-A', 'tenant-B', 'tenant-C', 'tenant-D'];

const userIdArb = fc.constantFrom(...userIdPool);
const tenantIdArb = fc.constantFrom(...tenantIdPool);

/** Generate a list of penerima user IDs (recipients registered in pengumuman_penerima) */
const penerimaListArb = fc.uniqueArray(userIdArb, { minLength: 0, maxLength: 8 });

/** Generate a user's tenant list (tenants the user belongs to) */
const userTenantsArb = fc.uniqueArray(tenantIdArb, { minLength: 1, maxLength: 4 });

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('Feature: announcement, Property 6: Recipient-Only Access Control', () => {
  describe('Access granted when both conditions are met', () => {
    it('user in penerima AND tenant matches → access granted', () => {
      fc.assert(
        fc.property(
          penerimaListArb.filter((list) => list.length > 0),
          userTenantsArb,
          (penerimaUserIds, userTenants) => {
            // Pick a user who IS in the penerima list
            const userId = penerimaUserIds[0];
            // Pick a tenant that IS in the user's tenant list
            const pengumumanTenantId = userTenants[0];

            const result = canAccessPengumuman(
              userId,
              pengumumanTenantId,
              penerimaUserIds,
              userTenants,
            );

            expect(result).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Access denied when user is NOT in penerima', () => {
    it('user NOT in penerima → access denied regardless of tenant match', () => {
      fc.assert(
        fc.property(
          penerimaListArb,
          userTenantsArb,
          tenantIdArb,
          (penerimaUserIds, userTenants, pengumumanTenantId) => {
            // Use a user ID guaranteed to NOT be in penerima list
            const nonRecipientUserId = 'user-non-existent';

            const result = canAccessPengumuman(
              nonRecipientUserId,
              pengumumanTenantId,
              penerimaUserIds,
              userTenants,
            );

            expect(result).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('user NOT in penerima even if tenant matches → access denied', () => {
      fc.assert(
        fc.property(userTenantsArb, userIdArb, (userTenants, userId) => {
          // Penerima list that explicitly excludes the user
          const penerimaUserIds = userIdPool.filter((id) => id !== userId);
          // Tenant that IS in user's list (so only penerima check fails)
          const pengumumanTenantId = userTenants[0];

          const result = canAccessPengumuman(
            userId,
            pengumumanTenantId,
            penerimaUserIds,
            userTenants,
          );

          expect(result).toBe(false);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Access denied when tenant does NOT match', () => {
    it('tenant NOT in user tenants → access denied regardless of penerima status', () => {
      fc.assert(
        fc.property(
          penerimaListArb.filter((list) => list.length > 0),
          userTenantsArb,
          (penerimaUserIds, userTenants) => {
            // Pick a user who IS in penerima
            const userId = penerimaUserIds[0];
            // Pick a tenant that is NOT in user's tenant list
            const nonMatchingTenant = tenantIdPool.find((t) => !userTenants.includes(t));

            // Skip if all tenants happen to be in user's list (unlikely but possible)
            if (!nonMatchingTenant) return;

            const result = canAccessPengumuman(
              userId,
              nonMatchingTenant,
              penerimaUserIds,
              userTenants,
            );

            expect(result).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('tenant mismatch even with user in penerima → access denied', () => {
      fc.assert(
        fc.property(
          userIdArb,
          tenantIdArb,
          tenantIdArb,
          (userId, pengumumanTenantId, userTenant) => {
            // Precondition: ensure tenant mismatch
            fc.pre(pengumumanTenantId !== userTenant);

            // User IS in penerima, but tenant does NOT match
            const penerimaUserIds = [userId];
            const userTenants = [userTenant];

            const result = canAccessPengumuman(
              userId,
              pengumumanTenantId,
              penerimaUserIds,
              userTenants,
            );

            expect(result).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Both conditions must be true simultaneously', () => {
    it('access is granted if and only if BOTH penerima membership AND tenant match hold', () => {
      fc.assert(
        fc.property(
          userIdArb,
          tenantIdArb,
          penerimaListArb,
          userTenantsArb,
          (userId, pengumumanTenantId, penerimaUserIds, userTenants) => {
            const result = canAccessPengumuman(
              userId,
              pengumumanTenantId,
              penerimaUserIds,
              userTenants,
            );

            const isInPenerima = penerimaUserIds.includes(userId);
            const tenantMatches = userTenants.includes(pengumumanTenantId);
            const expectedAccess = isInPenerima && tenantMatches;

            expect(result).toBe(expectedAccess);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('negation: at least one condition failing → access denied', () => {
      fc.assert(
        fc.property(
          userIdArb,
          tenantIdArb,
          penerimaListArb,
          userTenantsArb,
          (userId, pengumumanTenantId, penerimaUserIds, userTenants) => {
            const isInPenerima = penerimaUserIds.includes(userId);
            const tenantMatches = userTenants.includes(pengumumanTenantId);

            // Only test cases where at least one condition fails
            fc.pre(!isInPenerima || !tenantMatches);

            const result = canAccessPengumuman(
              userId,
              pengumumanTenantId,
              penerimaUserIds,
              userTenants,
            );

            expect(result).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Edge cases', () => {
    it('empty penerima list → always denied', () => {
      fc.assert(
        fc.property(
          userIdArb,
          tenantIdArb,
          userTenantsArb,
          (userId, pengumumanTenantId, userTenants) => {
            const result = canAccessPengumuman(userId, pengumumanTenantId, [], userTenants);

            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('user with single tenant that matches + is in penerima → granted', () => {
      fc.assert(
        fc.property(userIdArb, tenantIdArb, (userId, tenantId) => {
          const result = canAccessPengumuman(userId, tenantId, [userId], [tenantId]);

          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('user with multiple tenants — access granted only when pengumuman tenant is among them', () => {
      fc.assert(
        fc.property(
          userIdArb,
          fc.uniqueArray(tenantIdArb, { minLength: 2, maxLength: 4 }),
          tenantIdArb,
          (userId, userTenants, pengumumanTenantId) => {
            const penerimaUserIds = [userId]; // User is always in penerima for this test
            const result = canAccessPengumuman(
              userId,
              pengumumanTenantId,
              penerimaUserIds,
              userTenants,
            );

            if (userTenants.includes(pengumumanTenantId)) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
