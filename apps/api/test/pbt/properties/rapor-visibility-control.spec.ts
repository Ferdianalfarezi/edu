/**
 * Property 19: Rapor Visibility Control
 *
 * For any rapor queried by a parent (orang_tua), the system SHALL return only rapor
 * records with status `final`. Draft rapor SHALL never be visible to parents.
 *
 * Additionally:
 * - After revert (final→draft), rapor becomes invisible to parents again (Req 38.7/38.9)
 * - Kepala_sekolah can see ALL rapor regardless of status (draft + final) (Req 38.11)
 *
 * **Validates: Requirements 38.7, 39.1, 39.2**
 *
 * This is a PURE logic property test — simulates the visibility filtering function
 * with arbitrary rapor records, roles, and status transitions. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitraryRaporPeriod, type RaporPeriod } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

type RaporStatus = 'draft' | 'final';

interface Rapor {
  id: string;
  kelas_id: string;
  tahun_ajaran_id: string;
  tenant_id: string;
  periode: RaporPeriod;
  status: RaporStatus;
  finalized_by: string | null;
  finalized_at: Date | null;
}

type ViewerRole = 'orang_tua' | 'kepala_sekolah';

// ─── Pure logic (mirrors the visibility filtering in the rapor services) ──────

/**
 * Filters rapor records visible to orang_tua.
 * Parents can ONLY see rapor with status = 'final' (Req 39.1, 39.2).
 * Draft rapor are NEVER visible to parents.
 */
function filterRaporForOrangTua(rapors: Rapor[]): Rapor[] {
  return rapors.filter((r) => r.status === 'final');
}

/**
 * Filters rapor records visible to kepala_sekolah.
 * Kepala_sekolah can see ALL rapor regardless of status (draft + final) (Req 38.11).
 */
function filterRaporForKepalaSekolah(rapors: Rapor[]): Rapor[] {
  return rapors; // No filtering — sees everything
}

/**
 * Determines which rapor records are visible to a given role.
 */
function getVisibleRapor(rapors: Rapor[], role: ViewerRole): Rapor[] {
  switch (role) {
    case 'orang_tua':
      return filterRaporForOrangTua(rapors);
    case 'kepala_sekolah':
      return filterRaporForKepalaSekolah(rapors);
  }
}

/**
 * Simulates rapor finalization: sets status to 'final'.
 * This makes the rapor visible to orang_tua (Req 38.7).
 */
function finalizeRapor(rapor: Rapor, userId: string): Rapor {
  return {
    ...rapor,
    status: 'final',
    finalized_by: userId,
    finalized_at: new Date(),
  };
}

/**
 * Simulates rapor revert: sets status back to 'draft'.
 * After revert, rapor is no longer visible to orang_tua (Req 38.9).
 */
function revertRapor(rapor: Rapor): Rapor {
  return {
    ...rapor,
    status: 'draft',
    finalized_by: null,
    finalized_at: null,
  };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

function arbitraryRaporStatus(): fc.Arbitrary<RaporStatus> {
  return fc.constantFrom('draft', 'final');
}

function arbitraryRapor(overrides?: Partial<Rapor>): fc.Arbitrary<Rapor> {
  return fc.record({
    id: overrides?.id ? fc.constant(overrides.id) : arbitraryUuid(),
    kelas_id: overrides?.kelas_id ? fc.constant(overrides.kelas_id) : arbitraryUuid(),
    tahun_ajaran_id: overrides?.tahun_ajaran_id
      ? fc.constant(overrides.tahun_ajaran_id)
      : arbitraryUuid(),
    tenant_id: overrides?.tenant_id ? fc.constant(overrides.tenant_id) : arbitraryUuid(),
    periode: overrides?.periode ? fc.constant(overrides.periode) : arbitraryRaporPeriod(),
    status: overrides?.status ? fc.constant(overrides.status) : arbitraryRaporStatus(),
    finalized_by: overrides?.finalized_by
      ? fc.constant(overrides.finalized_by)
      : fc.option(arbitraryUuid(), { nil: null }),
    finalized_at: overrides?.finalized_at
      ? fc.constant(overrides.finalized_at)
      : fc.option(fc.date(), { nil: null }),
  });
}

function arbitraryRaporList(minLength = 1, maxLength = 10): fc.Arbitrary<Rapor[]> {
  return fc.array(arbitraryRapor(), { minLength, maxLength });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 19: Rapor Visibility Control', () => {
  describe('Draft rapor is NEVER visible to orang_tua (Req 39.1, 39.2)', () => {
    it('rapor with status=draft is never included in orang_tua view', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryRapor({ status: 'draft' }), { minLength: 1, maxLength: 10 }),
          (draftRapors) => {
            const visible = getVisibleRapor(draftRapors, 'orang_tua');

            // PROPERTY: no draft rapor should ever appear in parent's view
            return visible.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('in a mixed list of draft and final rapor, only final ones are visible to orang_tua', () => {
      fc.assert(
        fc.property(arbitraryRaporList(2, 15), (rapors) => {
          const visible = getVisibleRapor(rapors, 'orang_tua');

          // PROPERTY: every visible rapor must have status 'final'
          return visible.every((r) => r.status === 'final');
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Final rapor IS visible to orang_tua (Req 39.2)', () => {
    it('rapor with status=final is always included in orang_tua view', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryRapor({ status: 'final' }), { minLength: 1, maxLength: 10 }),
          (finalRapors) => {
            const visible = getVisibleRapor(finalRapors, 'orang_tua');

            // PROPERTY: all final rapor should be visible to parents
            return visible.length === finalRapors.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('the count of visible rapor for orang_tua equals the count of final rapor in the list', () => {
      fc.assert(
        fc.property(arbitraryRaporList(1, 20), (rapors) => {
          const visible = getVisibleRapor(rapors, 'orang_tua');
          const expectedCount = rapors.filter((r) => r.status === 'final').length;

          // PROPERTY: visible count must exactly equal the number of final rapor
          return visible.length === expectedCount;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('After revert (final→draft), rapor becomes invisible to orang_tua (Req 38.7)', () => {
    it('a finalized rapor that is reverted back to draft disappears from orang_tua view', () => {
      fc.assert(
        fc.property(
          arbitraryRapor({ status: 'draft' }), // start as draft
          arbitraryUuid(), // wali_kelas_id who finalizes
          (draftRapor, waliKelasId) => {
            // Step 1: Finalize rapor
            const finalized = finalizeRapor(draftRapor, waliKelasId);

            // Verify it's visible after finalization
            const visibleAfterFinalize = getVisibleRapor([finalized], 'orang_tua');
            if (visibleAfterFinalize.length !== 1) return false;

            // Step 2: Revert rapor
            const reverted = revertRapor(finalized);

            // PROPERTY: after revert, rapor is no longer visible to orang_tua
            const visibleAfterRevert = getVisibleRapor([reverted], 'orang_tua');
            return visibleAfterRevert.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('revert only hides the reverted rapor, other final rapor remain visible', () => {
      fc.assert(
        fc.property(
          arbitraryRapor({ status: 'final' }), // rapor to revert
          fc.array(arbitraryRapor({ status: 'final' }), { minLength: 1, maxLength: 5 }), // other final rapors
          (raporToRevert, otherFinalRapors) => {
            // All rapor (including the one to revert) are visible initially
            const allRapors = [raporToRevert, ...otherFinalRapors];
            const visibleBefore = getVisibleRapor(allRapors, 'orang_tua');
            if (visibleBefore.length !== allRapors.length) return false;

            // Revert one rapor
            const reverted = revertRapor(raporToRevert);
            const afterRevert = [reverted, ...otherFinalRapors];
            const visibleAfter = getVisibleRapor(afterRevert, 'orang_tua');

            // PROPERTY: only the reverted rapor disappears; others stay visible
            return visibleAfter.length === otherFinalRapors.length;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Kepala_sekolah can see ALL rapor regardless of status (Req 38.11)', () => {
    it('kepala_sekolah sees all rapor — both draft and final', () => {
      fc.assert(
        fc.property(arbitraryRaporList(1, 20), (rapors) => {
          const visible = getVisibleRapor(rapors, 'kepala_sekolah');

          // PROPERTY: kepala_sekolah sees ALL rapor without any filtering
          return visible.length === rapors.length;
        }),
        PBT_CONFIG,
      );
    });

    it('kepala_sekolah sees draft rapor that are invisible to orang_tua', () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryRapor({ status: 'draft' }), { minLength: 1, maxLength: 10 }),
          (draftRapors) => {
            const visibleToParent = getVisibleRapor(draftRapors, 'orang_tua');
            const visibleToKepsek = getVisibleRapor(draftRapors, 'kepala_sekolah');

            // PROPERTY: orang_tua sees 0, kepala_sekolah sees all
            return visibleToParent.length === 0 && visibleToKepsek.length === draftRapors.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('kepala_sekolah visibility is a superset of orang_tua visibility', () => {
      fc.assert(
        fc.property(arbitraryRaporList(1, 20), (rapors) => {
          const visibleToParent = getVisibleRapor(rapors, 'orang_tua');
          const visibleToKepsek = getVisibleRapor(rapors, 'kepala_sekolah');

          // PROPERTY: everything visible to orang_tua is also visible to kepala_sekolah
          // AND kepala_sekolah may see MORE (the drafts)
          const parentIds = new Set(visibleToParent.map((r) => r.id));
          const kepsekIds = new Set(visibleToKepsek.map((r) => r.id));

          // Every parent-visible rapor must be kepsek-visible
          for (const id of parentIds) {
            if (!kepsekIds.has(id)) return false;
          }

          // Kepsek always sees at least as many
          return visibleToKepsek.length >= visibleToParent.length;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Full lifecycle: draft → final → revert → final again', () => {
    it('rapor visibility toggles correctly through finalize/revert cycles', () => {
      fc.assert(
        fc.property(
          arbitraryRapor({ status: 'draft' }),
          arbitraryUuid(), // wali_kelas_id
          fc.integer({ min: 1, max: 5 }), // number of finalize/revert cycles
          (initialRapor, waliKelasId, cycles) => {
            let currentRapor = initialRapor;

            for (let i = 0; i < cycles; i++) {
              // Finalize
              currentRapor = finalizeRapor(currentRapor, waliKelasId);
              const afterFinalize = getVisibleRapor([currentRapor], 'orang_tua');
              if (afterFinalize.length !== 1) return false;

              // Revert
              currentRapor = revertRapor(currentRapor);
              const afterRevert = getVisibleRapor([currentRapor], 'orang_tua');
              if (afterRevert.length !== 0) return false;
            }

            // After final cycle ends at draft, finalize one more time
            currentRapor = finalizeRapor(currentRapor, waliKelasId);
            const finalVisibility = getVisibleRapor([currentRapor], 'orang_tua');

            // PROPERTY: after final finalization, rapor is visible
            return finalVisibility.length === 1;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
