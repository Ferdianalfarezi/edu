/**
 * Property 20: Rapor Finalization Guard
 *
 * For any class rapor finalization attempt:
 * (a) Only the wali_kelas assigned to that specific class can finalize (Req 38.1)
 * (b) Finalization is blocked when any mapel has NOT been submitted by its guru (Req 38.2)
 * (c) When all mapel are submitted, finalization succeeds (Req 38.3)
 * (d) After finalization (status='final'), guru cannot edit nilai (Req 38.8)
 *
 * **Validates: Requirements 38.1, 38.2, 38.3**
 *
 * Properties verified:
 * 1. Finalization by non-wali_kelas is always rejected
 * 2. Finalization with incomplete mapel submissions is always blocked
 * 3. Finalization with all mapel submitted by wali_kelas always succeeds
 * 4. After rapor status='final', any guru edit attempt is blocked
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, RAPOR_PERIODS, type RaporPeriod } from '../arbitraries/common';

// ─── Domain Types ─────────────────────────────────────────────────────────────

interface Kelas {
  id: string;
  tenant_id: string;
  wali_kelas_id: string;
}

interface MapelSubmission {
  mata_pelajaran_id: string;
  submitted: boolean;
}

interface RaporRecord {
  id: string;
  kelas_id: string;
  tenant_id: string;
  tahun_ajaran_id: string;
  periode: RaporPeriod;
  status: 'draft' | 'final';
  finalized_by: string | null;
}

type FinalizationResult =
  | { success: true; rapor_id: string }
  | { success: false; reason: 'not_wali_kelas' | 'incomplete_submissions' | 'already_final' };

type EditResult =
  { success: true } | { success: false; reason: 'rapor_finalized' | 'not_authorized' };

// ─── Pure Logic Under Test ────────────────────────────────────────────────────

/**
 * Validates that the user is the wali_kelas for the given class.
 * Requirement 38.1: Only wali_kelas of the specific class can finalize.
 */
function isWaliKelas(kelas: Kelas, userId: string): boolean {
  return kelas.wali_kelas_id === userId;
}

/**
 * Checks whether all mapel for the class have been submitted by their respective guru.
 * Requirement 38.2: Finalization blocked when any mapel NOT submitted.
 */
function allMapelSubmitted(submissions: MapelSubmission[]): boolean {
  if (submissions.length === 0) return true; // No mapel → trivially complete
  return submissions.every((s) => s.submitted);
}

/**
 * Attempts to finalize a rapor for a class.
 * Implements the finalization guard logic combining Req 38.1, 38.2, 38.3.
 */
function attemptFinalization(
  kelas: Kelas,
  rapor: RaporRecord,
  userId: string,
  mapelSubmissions: MapelSubmission[],
): FinalizationResult {
  // Guard 1: Already final
  if (rapor.status === 'final') {
    return { success: false, reason: 'already_final' };
  }

  // Guard 2: Must be wali_kelas (Req 38.1)
  if (!isWaliKelas(kelas, userId)) {
    return { success: false, reason: 'not_wali_kelas' };
  }

  // Guard 3: All mapel must be submitted (Req 38.2)
  if (!allMapelSubmitted(mapelSubmissions)) {
    return { success: false, reason: 'incomplete_submissions' };
  }

  // All guards passed → finalization succeeds (Req 38.3)
  return { success: true, rapor_id: rapor.id };
}

/**
 * Attempts to edit nilai after rapor has been finalized.
 * Requirement 38.8: guru cannot edit nilai after finalization.
 */
function attemptEditNilai(rapor: RaporRecord, guruId: string, _mapelId: string): EditResult {
  // Block all guru edits when rapor is final
  if (rapor.status === 'final') {
    return { success: false, reason: 'rapor_finalized' };
  }
  return { success: true };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

function arbitraryKelasWithWali(): fc.Arbitrary<{ kelas: Kelas; waliKelasId: string }> {
  return fc
    .record({
      kelasId: arbitraryUuid(),
      tenantId: arbitraryUuid(),
      waliKelasId: arbitraryUuid(),
    })
    .map(({ kelasId, tenantId, waliKelasId }) => ({
      kelas: {
        id: kelasId,
        tenant_id: tenantId,
        wali_kelas_id: waliKelasId,
      },
      waliKelasId,
    }));
}

function arbitraryRaporDraft(kelasId?: string, tenantId?: string): fc.Arbitrary<RaporRecord> {
  return fc.record({
    id: arbitraryUuid(),
    kelas_id: kelasId ? fc.constant(kelasId) : arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    tahun_ajaran_id: arbitraryUuid(),
    periode: fc.constantFrom(...RAPOR_PERIODS),
    status: fc.constant('draft' as const),
    finalized_by: fc.constant(null),
  });
}

function arbitraryRaporFinal(kelasId?: string, tenantId?: string): fc.Arbitrary<RaporRecord> {
  return fc.record({
    id: arbitraryUuid(),
    kelas_id: kelasId ? fc.constant(kelasId) : arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    tahun_ajaran_id: arbitraryUuid(),
    periode: fc.constantFrom(...RAPOR_PERIODS),
    status: fc.constant('final' as const),
    finalized_by: arbitraryUuid(),
  });
}

/**
 * Generates a list of mapel submissions where ALL are submitted.
 */
function arbitraryAllSubmitted(): fc.Arbitrary<MapelSubmission[]> {
  return fc
    .array(arbitraryUuid(), { minLength: 1, maxLength: 10 })
    .map((ids) => ids.map((id) => ({ mata_pelajaran_id: id, submitted: true })));
}

/**
 * Generates a list of mapel submissions where AT LEAST ONE is NOT submitted.
 */
function arbitraryIncompleteSubmissions(): fc.Arbitrary<MapelSubmission[]> {
  return fc
    .tuple(
      // At least one unsubmitted
      fc
        .array(arbitraryUuid(), { minLength: 1, maxLength: 5 })
        .map((ids) => ids.map((id) => ({ mata_pelajaran_id: id, submitted: false }))),
      // Zero or more submitted
      fc
        .array(arbitraryUuid(), { minLength: 0, maxLength: 5 })
        .map((ids) => ids.map((id) => ({ mata_pelajaran_id: id, submitted: true }))),
    )
    .map(([unsubmitted, submitted]) => {
      // Shuffle to avoid ordering bias
      const all = [...unsubmitted, ...submitted];
      return all.sort(() => Math.random() - 0.5);
    });
}

/**
 * Generates a guru ID that is NOT the wali_kelas.
 */
function arbitraryNonWaliKelas(waliKelasId: string): fc.Arbitrary<string> {
  return arbitraryUuid().filter((id) => id !== waliKelasId);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 20: Rapor Finalization Guard', () => {
  describe('Requirement 38.1: Only wali_kelas can finalize', () => {
    it('finalization by non-wali_kelas is always rejected regardless of submission status', () => {
      fc.assert(
        fc.property(
          arbitraryKelasWithWali(),
          fc.oneof(arbitraryAllSubmitted(), arbitraryIncompleteSubmissions()),
          arbitraryUuid(),
          fc.constantFrom(...RAPOR_PERIODS),
          (kelasData, submissions, nonWaliId, periode) => {
            const { kelas, waliKelasId } = kelasData;
            // Ensure the non-wali ID is actually different
            if (nonWaliId === waliKelasId) return true; // skip, not a valid test case

            const rapor: RaporRecord = {
              id: 'rapor-nonwali',
              kelas_id: kelas.id,
              tenant_id: kelas.tenant_id,
              tahun_ajaran_id: 'ta-1',
              periode,
              status: 'draft',
              finalized_by: null,
            };

            const result = attemptFinalization(kelas, rapor, nonWaliId, submissions);
            // PROPERTY: Non-wali_kelas is always rejected
            return result.success === false && result.reason === 'not_wali_kelas';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('finalization by wali_kelas of the correct class is not rejected for role reasons', () => {
      fc.assert(
        fc.property(arbitraryKelasWithWali(), arbitraryAllSubmitted(), (kelasData, submissions) => {
          const { kelas, waliKelasId } = kelasData;
          const rapor: RaporRecord = {
            id: 'rapor-1',
            kelas_id: kelas.id,
            tenant_id: kelas.tenant_id,
            tahun_ajaran_id: 'ta-1',
            periode: 'semester_1',
            status: 'draft',
            finalized_by: null,
          };

          const result = attemptFinalization(kelas, rapor, waliKelasId, submissions);
          // PROPERTY: Wali_kelas with all submitted → never fails with 'not_wali_kelas'
          if (!result.success) {
            return result.reason !== 'not_wali_kelas';
          }
          return true;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Requirement 38.2: Finalization blocked when mapel not submitted', () => {
    it('finalization is always blocked when any mapel has NOT been submitted', () => {
      fc.assert(
        fc.property(
          arbitraryKelasWithWali(),
          arbitraryIncompleteSubmissions(),
          (kelasData, submissions) => {
            const { kelas, waliKelasId } = kelasData;
            const rapor: RaporRecord = {
              id: 'rapor-check',
              kelas_id: kelas.id,
              tenant_id: kelas.tenant_id,
              tahun_ajaran_id: 'ta-active',
              periode: 'semester_1',
              status: 'draft',
              finalized_by: null,
            };

            const result = attemptFinalization(kelas, rapor, waliKelasId, submissions);
            // PROPERTY: Incomplete submissions always block finalization
            return result.success === false && result.reason === 'incomplete_submissions';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('a single unsubmitted mapel among many submitted still blocks finalization', () => {
      fc.assert(
        fc.property(
          arbitraryKelasWithWali(),
          fc.array(arbitraryUuid(), { minLength: 1, maxLength: 9 }),
          arbitraryUuid(),
          (kelasData, submittedMapelIds, unsubmittedMapelId) => {
            const { kelas, waliKelasId } = kelasData;
            const submissions: MapelSubmission[] = [
              ...submittedMapelIds.map((id) => ({ mata_pelajaran_id: id, submitted: true })),
              { mata_pelajaran_id: unsubmittedMapelId, submitted: false },
            ];

            const rapor: RaporRecord = {
              id: 'rapor-partial',
              kelas_id: kelas.id,
              tenant_id: kelas.tenant_id,
              tahun_ajaran_id: 'ta-active',
              periode: 'uts_semester_2',
              status: 'draft',
              finalized_by: null,
            };

            const result = attemptFinalization(kelas, rapor, waliKelasId, submissions);
            // PROPERTY: Even one unsubmitted mapel blocks finalization
            return result.success === false && result.reason === 'incomplete_submissions';
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Requirement 38.3: Finalization succeeds when all mapel submitted', () => {
    it('wali_kelas can finalize when all mapel are submitted and rapor is draft', () => {
      fc.assert(
        fc.property(
          arbitraryKelasWithWali(),
          arbitraryAllSubmitted(),
          fc.constantFrom(...RAPOR_PERIODS),
          (kelasData, submissions, periode) => {
            const { kelas, waliKelasId } = kelasData;
            const rapor: RaporRecord = {
              id: 'rapor-ready',
              kelas_id: kelas.id,
              tenant_id: kelas.tenant_id,
              tahun_ajaran_id: 'ta-active',
              periode,
              status: 'draft',
              finalized_by: null,
            };

            const result = attemptFinalization(kelas, rapor, waliKelasId, submissions);
            // PROPERTY: Wali_kelas + all submitted + draft → finalization succeeds
            return result.success === true && result.rapor_id === rapor.id;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('finalization of already-final rapor is rejected even by wali_kelas', () => {
      fc.assert(
        fc.property(arbitraryKelasWithWali(), arbitraryAllSubmitted(), (kelasData, submissions) => {
          const { kelas, waliKelasId } = kelasData;
          const rapor: RaporRecord = {
            id: 'rapor-already-final',
            kelas_id: kelas.id,
            tenant_id: kelas.tenant_id,
            tahun_ajaran_id: 'ta-active',
            periode: 'semester_2',
            status: 'final',
            finalized_by: waliKelasId,
          };

          const result = attemptFinalization(kelas, rapor, waliKelasId, submissions);
          // PROPERTY: Already-final rapor cannot be finalized again
          return result.success === false && result.reason === 'already_final';
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('Requirement 38.8: Edit block after finalization', () => {
    it('guru cannot edit nilai when rapor status is final', () => {
      fc.assert(
        fc.property(
          arbitraryRaporFinal(),
          arbitraryUuid(), // guruId
          arbitraryUuid(), // mapelId
          (rapor, guruId, mapelId) => {
            const result = attemptEditNilai(rapor, guruId, mapelId);
            // PROPERTY: Any guru edit attempt on final rapor is blocked
            return result.success === false && result.reason === 'rapor_finalized';
          },
        ),
        PBT_CONFIG,
      );
    });

    it('guru can edit nilai when rapor status is draft', () => {
      fc.assert(
        fc.property(
          arbitraryRaporDraft(),
          arbitraryUuid(), // guruId
          arbitraryUuid(), // mapelId
          (rapor, guruId, mapelId) => {
            const result = attemptEditNilai(rapor, guruId, mapelId);
            // PROPERTY: Guru can edit when rapor is still in draft
            return result.success === true;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('edit block applies regardless of which guru attempts the edit', () => {
      fc.assert(
        fc.property(
          arbitraryKelasWithWali(),
          arbitraryUuid(), // mapelId
          (kelasData, mapelId) => {
            const { kelas, waliKelasId } = kelasData;
            const rapor: RaporRecord = {
              id: 'rapor-locked',
              kelas_id: kelas.id,
              tenant_id: kelas.tenant_id,
              tahun_ajaran_id: 'ta-1',
              periode: 'semester_1',
              status: 'final',
              finalized_by: waliKelasId,
            };

            // Even wali_kelas cannot edit nilai after finalization
            const waliResult = attemptEditNilai(rapor, waliKelasId, mapelId);
            // A random other guru also blocked
            const otherGuruId = `other-${waliKelasId}`;
            const otherResult = attemptEditNilai(rapor, otherGuruId, mapelId);

            return (
              waliResult.success === false &&
              waliResult.reason === 'rapor_finalized' &&
              otherResult.success === false &&
              otherResult.reason === 'rapor_finalized'
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
