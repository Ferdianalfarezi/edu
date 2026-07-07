/**
 * Property 21: RPP Ownership Enforcement
 *
 * For any RPP edit or delete attempt:
 * (a) Only the creator (guru_id) can edit their own RPP — any other user is rejected (Req 42.1)
 * (b) Only the creator (guru_id) can delete their own RPP — any other user is rejected (Req 42.4)
 * (c) The creator can always edit/delete their own RPP (no false rejections)
 *
 * **Validates: Requirements 42.1, 42.4**
 *
 * Properties verified:
 * 1. Edit by non-creator is always rejected
 * 2. Delete by non-creator is always rejected
 * 3. Creator can always edit their own RPP
 * 4. Creator can always delete their own RPP
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, RPP_STATUSES, type RppStatus } from '../arbitraries/common';

// ─── Domain Types ─────────────────────────────────────────────────────────────

interface RppRecord {
  id: string;
  tenant_id: string;
  guru_id: string;
  mata_pelajaran_id: string;
  kategori_id: string;
  judul: string;
  konten_type: 'richtext' | 'file';
  status: RppStatus;
}

type RppEditResult = { success: true } | { success: false; reason: 'not_owner' | 'not_found' };

type RppDeleteResult = { success: true } | { success: false; reason: 'not_owner' | 'not_found' };

// ─── Pure Logic Under Test ────────────────────────────────────────────────────

/**
 * Checks if the requesting user is the owner (creator) of the RPP.
 * Requirements 42.1, 42.4: Only guru pembuat can edit/delete.
 */
function isRppOwner(rpp: RppRecord, userId: string): boolean {
  return rpp.guru_id === userId;
}

/**
 * Attempts to edit an RPP.
 * Requirement 42.1: Only the creator (guru_id) can edit their own RPP.
 */
function attemptEditRpp(rpp: RppRecord | null, userId: string): RppEditResult {
  if (!rpp) {
    return { success: false, reason: 'not_found' };
  }
  if (!isRppOwner(rpp, userId)) {
    return { success: false, reason: 'not_owner' };
  }
  return { success: true };
}

/**
 * Attempts to delete an RPP.
 * Requirement 42.4: Only the creator (guru_id) can delete their own RPP.
 */
function attemptDeleteRpp(rpp: RppRecord | null, userId: string): RppDeleteResult {
  if (!rpp) {
    return { success: false, reason: 'not_found' };
  }
  if (!isRppOwner(rpp, userId)) {
    return { success: false, reason: 'not_owner' };
  }
  return { success: true };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a valid RPP record with a known creator (guru_id).
 */
function arbitraryRpp(tenantId?: string, guruId?: string): fc.Arbitrary<RppRecord> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    guru_id: guruId ? fc.constant(guruId) : arbitraryUuid(),
    mata_pelajaran_id: arbitraryUuid(),
    kategori_id: arbitraryUuid(),
    judul: fc.string({ minLength: 1, maxLength: 100 }),
    konten_type: fc.constantFrom('richtext' as const, 'file' as const),
    status: fc.constantFrom(...RPP_STATUSES),
  });
}

/**
 * Generates a user ID that is guaranteed NOT to be the RPP creator.
 */
function arbitraryNonOwner(ownerId: string): fc.Arbitrary<string> {
  return arbitraryUuid().filter((id) => id !== ownerId);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 21: RPP Ownership Enforcement', () => {
  describe('Requirement 42.1: Only creator can edit RPP', () => {
    it('edit by non-creator is always rejected regardless of RPP status', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenantId
          arbitraryUuid(), // creatorId
          fc.constantFrom(...RPP_STATUSES),
          fc.constantFrom('richtext' as const, 'file' as const),
          (tenantId, creatorId, status, kontenType) => {
            const rppRecord: RppRecord = {
              id: 'rpp-test',
              tenant_id: tenantId,
              guru_id: creatorId,
              mata_pelajaran_id: 'mapel-1',
              kategori_id: 'kat-1',
              judul: 'Test RPP',
              konten_type: kontenType,
              status,
            };

            // Generate a non-owner by appending suffix (guaranteed different)
            const nonOwnerId = `other-${creatorId}`;

            const result = attemptEditRpp(rppRecord, nonOwnerId);
            // PROPERTY: Non-creator is always rejected for edit
            return result.success === false && result.reason === 'not_owner';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('edit by any arbitrary non-owner user is always rejected', () => {
      fc.assert(
        fc.property(
          arbitraryRpp(),
          arbitraryUuid(), // attacker
          (rppRecord, attackerId) => {
            // Skip if attacker happens to be the owner (extremely unlikely with UUIDs)
            if (attackerId === rppRecord.guru_id) return true;

            const result = attemptEditRpp(rppRecord, attackerId);
            // PROPERTY: Non-owner is always rejected
            return result.success === false && result.reason === 'not_owner';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Requirement 42.4: Only creator can delete RPP', () => {
    it('delete by non-creator is always rejected regardless of RPP status', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenantId
          arbitraryUuid(), // creatorId
          fc.constantFrom(...RPP_STATUSES),
          fc.constantFrom('richtext' as const, 'file' as const),
          (tenantId, creatorId, status, kontenType) => {
            const rppRecord: RppRecord = {
              id: 'rpp-delete-test',
              tenant_id: tenantId,
              guru_id: creatorId,
              mata_pelajaran_id: 'mapel-1',
              kategori_id: 'kat-1',
              judul: 'Test RPP Delete',
              konten_type: kontenType,
              status,
            };

            // Guaranteed different user
            const nonOwnerId = `other-${creatorId}`;

            const result = attemptDeleteRpp(rppRecord, nonOwnerId);
            // PROPERTY: Non-creator is always rejected for delete
            return result.success === false && result.reason === 'not_owner';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('delete by any arbitrary non-owner user is always rejected', () => {
      fc.assert(
        fc.property(
          arbitraryRpp(),
          arbitraryUuid(), // attacker
          (rppRecord, attackerId) => {
            // Skip if attacker happens to be the owner
            if (attackerId === rppRecord.guru_id) return true;

            const result = attemptDeleteRpp(rppRecord, attackerId);
            // PROPERTY: Non-owner is always rejected
            return result.success === false && result.reason === 'not_owner';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('No false rejections: Creator can always edit/delete', () => {
    it('creator can always edit their own RPP regardless of status', () => {
      fc.assert(
        fc.property(arbitraryRpp(), (rppRecord) => {
          const result = attemptEditRpp(rppRecord, rppRecord.guru_id);
          // PROPERTY: Creator is never rejected for edit
          return result.success === true;
        }),
        PBT_CONFIG,
      );
    });

    it('creator can always delete their own RPP regardless of status', () => {
      fc.assert(
        fc.property(arbitraryRpp(), (rppRecord) => {
          const result = attemptDeleteRpp(rppRecord, rppRecord.guru_id);
          // PROPERTY: Creator is never rejected for delete
          return result.success === true;
        }),
        PBT_CONFIG,
      );
    });

    it('ownership check is symmetric: edit and delete use same ownership rule', () => {
      fc.assert(
        fc.property(
          arbitraryRpp(),
          arbitraryUuid(), // any user
          (rppRecord, userId) => {
            const editResult = attemptEditRpp(rppRecord, userId);
            const deleteResult = attemptDeleteRpp(rppRecord, userId);

            // PROPERTY: If user can edit, they can also delete (and vice versa)
            return editResult.success === deleteResult.success;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
