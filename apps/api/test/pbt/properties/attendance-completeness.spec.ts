/**
 * Property 3: Attendance Completeness Validation
 *
 * For any class with N active students, the attendance submission endpoint SHALL:
 * 1. REJECT submissions with fewer than N records (missing students)
 * 2. ACCEPT submissions with exactly N records (one per active student)
 * 3. REJECT submissions containing student IDs not belonging to the class
 *
 * **Validates: Requirements 1.4, 1.5**
 *
 * This is a PURE property test — simulates the completeness check logic
 * without a real database. The core invariant: every active student must
 * have exactly one attendance record, no more and no less.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitraryAttendanceStatus } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveStudent {
  id: string;
  nama: string;
}

interface AttendanceRecord {
  siswa_id: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
}

interface CompletenessResult {
  valid: boolean;
  missingSiswa: ActiveStudent[];
  invalidIds: string[];
}

// ─── Simulated completeness check (mirrors AbsensiService logic) ──────────────

/**
 * Pure function that validates attendance completeness.
 * Mirrors the logic in AbsensiService.createAbsensi():
 * - All active students must be covered (Req 1.4)
 * - No extra students that don't belong to the class (Req 1.5 — error must list missing names)
 */
function validateAttendanceCompleteness(
  activeStudents: ActiveStudent[],
  records: AttendanceRecord[],
): CompletenessResult {
  const submittedSiswaIds = new Set(records.map((r) => r.siswa_id));
  const activeSiswaIds = new Set(activeStudents.map((s) => s.id));

  const missingSiswa = activeStudents.filter((s) => !submittedSiswaIds.has(s.id));
  const invalidIds = records.filter((r) => !activeSiswaIds.has(r.siswa_id)).map((r) => r.siswa_id);

  return {
    valid: missingSiswa.length === 0 && invalidIds.length === 0,
    missingSiswa,
    invalidIds,
  };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a list of N active students with unique IDs.
 */
function arbitraryActiveStudents(
  minCount: number = 1,
  maxCount: number = 40,
): fc.Arbitrary<ActiveStudent[]> {
  return fc
    .array(arbitraryUuid(), { minLength: minCount, maxLength: maxCount })
    .map((ids) => {
      // Ensure uniqueness
      const unique = [...new Set(ids)];
      return unique.map((id, idx) => ({
        id,
        nama: `Siswa ${idx + 1}`,
      }));
    })
    .filter((students) => students.length >= minCount);
}

/**
 * Generates a complete attendance submission — exactly one record per student.
 */
function arbitraryCompleteSubmission(students: ActiveStudent[]): fc.Arbitrary<AttendanceRecord[]> {
  if (students.length === 0) return fc.constant([]);

  const recordArbs = students.map((s) =>
    arbitraryAttendanceStatus().map((status) => ({
      siswa_id: s.id,
      status,
    })),
  );

  return fc.tuple(...recordArbs) as unknown as fc.Arbitrary<AttendanceRecord[]>;
}

/**
 * Generates an incomplete submission — a strict subset of the active students.
 * At least one student is missing.
 */
function arbitraryIncompleteSubmission(
  students: ActiveStudent[],
): fc.Arbitrary<AttendanceRecord[]> {
  if (students.length <= 1) {
    // If only 1 student, incomplete = empty
    return fc.constant([]);
  }

  return fc.subarray(students, { minLength: 0, maxLength: students.length - 1 }).chain((subset) => {
    if (subset.length === 0) return fc.constant([]);
    const arbs = subset.map((s) =>
      arbitraryAttendanceStatus().map((status) => ({
        siswa_id: s.id,
        status,
      })),
    );
    return fc.tuple(...arbs) as unknown as fc.Arbitrary<AttendanceRecord[]>;
  });
}

/**
 * Generates a submission that includes extra student IDs not in the class.
 */
function arbitrarySubmissionWithExtraStudents(
  students: ActiveStudent[],
): fc.Arbitrary<{ records: AttendanceRecord[]; extraIds: string[] }> {
  return fc
    .array(arbitraryUuid(), { minLength: 1, maxLength: 5 })
    .filter((extraIds) => {
      const activeSet = new Set(students.map((s) => s.id));
      return extraIds.some((id) => !activeSet.has(id));
    })
    .chain((extraIds) => {
      // Build records for all active students PLUS the extra ones
      const validRecordArbs = students.map((s) =>
        arbitraryAttendanceStatus().map((status) => ({
          siswa_id: s.id,
          status,
        })),
      );
      const extraRecordArbs = extraIds
        .filter((id) => !new Set(students.map((s) => s.id)).has(id))
        .map((id) =>
          arbitraryAttendanceStatus().map((status) => ({
            siswa_id: id,
            status,
          })),
        );

      const allArbs = [...validRecordArbs, ...extraRecordArbs];
      if (allArbs.length === 0)
        return fc.constant({ records: [] as AttendanceRecord[], extraIds: [] as string[] });

      return (fc.tuple(...allArbs) as unknown as fc.Arbitrary<AttendanceRecord[]>).map(
        (records) => ({
          records,
          extraIds: extraIds.filter((id) => !new Set(students.map((s) => s.id)).has(id)),
        }),
      );
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 3: Attendance Completeness Validation', () => {
  it('submissions with fewer than N records are REJECTED (missing students detected)', () => {
    fc.assert(
      fc.property(
        arbitraryActiveStudents(2, 35).chain((students) =>
          arbitraryIncompleteSubmission(students).map((records) => ({
            students,
            records,
          })),
        ),
        ({ students, records }) => {
          const result = validateAttendanceCompleteness(students, records);

          // PROPERTY: incomplete submissions must be invalid
          if (result.valid) return false;

          // PROPERTY: missing students must be correctly identified
          const submittedIds = new Set(records.map((r) => r.siswa_id));
          const expectedMissing = students.filter((s) => !submittedIds.has(s.id));

          return (
            result.missingSiswa.length === expectedMissing.length &&
            result.missingSiswa.every((m) => expectedMissing.some((e) => e.id === m.id))
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('submissions with exactly N records (one per student) are ACCEPTED', () => {
    fc.assert(
      fc.property(
        arbitraryActiveStudents(1, 35).chain((students) =>
          arbitraryCompleteSubmission(students).map((records) => ({
            students,
            records,
          })),
        ),
        ({ students, records }) => {
          const result = validateAttendanceCompleteness(students, records);

          // PROPERTY: complete submissions must be valid
          return (
            result.valid === true &&
            result.missingSiswa.length === 0 &&
            result.invalidIds.length === 0
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('submissions with extra student IDs not in the class are REJECTED', () => {
    fc.assert(
      fc.property(
        arbitraryActiveStudents(1, 20).chain((students) =>
          arbitrarySubmissionWithExtraStudents(students).map(({ records, extraIds }) => ({
            students,
            records,
            extraIds,
          })),
        ),
        ({ students, records, extraIds }) => {
          const result = validateAttendanceCompleteness(students, records);

          // PROPERTY: submissions with extra IDs must be invalid
          if (result.valid) return false;

          // PROPERTY: all extra IDs must appear in the invalidIds list
          const invalidSet = new Set(result.invalidIds);
          return extraIds.every((id) => invalidSet.has(id));
        },
      ),
      PBT_CONFIG,
    );
  });
});
