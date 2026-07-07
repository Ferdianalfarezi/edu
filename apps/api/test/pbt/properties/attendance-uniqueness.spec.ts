/**
 * Property 4: Attendance Uniqueness Per Student Per Day
 *
 * The system SHALL store at most ONE attendance record per student per day
 * (unique constraint on siswa_id + tanggal). The batch insert uses
 * ON CONFLICT DO NOTHING to enforce this at the DB level.
 *
 * **Validates: Requirements 1.8**
 *
 * Properties verified:
 * 1. For any student on any date, at most ONE attendance record can exist
 *    (simulating the ON CONFLICT DO NOTHING behavior)
 * 2. Multiple submissions for the same student+date result in exactly one stored record
 * 3. Different students on the same date can each have their own record (no conflict)
 * 4. Same student on different dates can have separate records
 *
 * Pure logic testing — simulates the uniqueness constraint without a real DB.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import {
  arbitraryUuid,
  arbitraryAttendanceStatus,
  arbitrarySchoolDate,
} from '../arbitraries/common';
import type { AbsensiRecord } from '../arbitraries/absensi';

// ─── Simulated Attendance Store (ON CONFLICT DO NOTHING) ──────────────────────

/**
 * Simulates the attendance table with UNIQUE(siswa_id, tanggal) constraint
 * and INSERT ... ON CONFLICT DO NOTHING behavior.
 *
 * This mirrors the actual DB behavior: if a record with the same (siswa_id, tanggal)
 * already exists, the insert is silently ignored.
 */
class AttendanceStore {
  private records: AbsensiRecord[] = [];

  /**
   * Insert records with ON CONFLICT DO NOTHING semantics.
   * Returns the number of records actually inserted (not conflicting).
   */
  insertBatch(records: AbsensiRecord[]): number {
    let inserted = 0;
    for (const record of records) {
      const exists = this.records.some(
        (existing) => existing.siswa_id === record.siswa_id && existing.tanggal === record.tanggal,
      );
      if (!exists) {
        this.records.push(record);
        inserted++;
      }
      // ON CONFLICT DO NOTHING — silently skip duplicates
    }
    return inserted;
  }

  /** Query records for a specific student on a specific date */
  getByStudentAndDate(siswaId: string, tanggal: string): AbsensiRecord[] {
    return this.records.filter((r) => r.siswa_id === siswaId && r.tanggal === tanggal);
  }

  /** Query all records for a specific student */
  getByStudent(siswaId: string): AbsensiRecord[] {
    return this.records.filter((r) => r.siswa_id === siswaId);
  }

  /** Query all records for a specific date */
  getByDate(tanggal: string): AbsensiRecord[] {
    return this.records.filter((r) => r.tanggal === tanggal);
  }

  /** Get total record count */
  get count(): number {
    return this.records.length;
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generates a batch of attendance records for a class (multiple students, same date) */
function arbitraryClassSubmission(options?: {
  tenantId?: string;
  kelasId?: string;
  guruId?: string;
  tanggal?: string;
  studentCount?: number;
}): fc.Arbitrary<AbsensiRecord[]> {
  const tenantId = options?.tenantId;
  const kelasId = options?.kelasId;
  const guruId = options?.guruId;

  const count = options?.studentCount ?? 5;

  return fc
    .tuple(
      tenantId ? fc.constant(tenantId) : arbitraryUuid(),
      kelasId ? fc.constant(kelasId) : arbitraryUuid(),
      guruId ? fc.constant(guruId) : arbitraryUuid(),
      options?.tanggal ? fc.constant(options.tanggal) : arbitrarySchoolDate(),
      fc.array(arbitraryUuid(), { minLength: count, maxLength: count }),
      fc.array(arbitraryAttendanceStatus(), { minLength: count, maxLength: count }),
    )
    .map(([tenant, kelas, guru, tanggal, siswaIds, statuses]) =>
      siswaIds.map((siswaId, i) => ({
        id: `${siswaId}-${tanggal}`,
        tenant_id: tenant,
        siswa_id: siswaId,
        kelas_id: kelas,
        tanggal,
        status: statuses[i],
        guru_id: guru,
      })),
    );
}

/**
 * Generates multiple submissions for the same student+date from different gurus.
 * Simulates the scenario where multiple teachers try to submit attendance
 * for the same student on the same day.
 */
function arbitraryDuplicateSubmissions(options?: { submissionCount?: number }): fc.Arbitrary<{
  siswaId: string;
  tanggal: string;
  submissions: AbsensiRecord[];
}> {
  const numSubmissions = options?.submissionCount ?? 3;

  return fc
    .tuple(
      arbitraryUuid(), // siswaId
      arbitraryUuid(), // tenantId
      arbitraryUuid(), // kelasId
      arbitrarySchoolDate(), // tanggal
      fc.array(arbitraryUuid(), { minLength: numSubmissions, maxLength: numSubmissions }), // guruIds
      fc.array(arbitraryAttendanceStatus(), {
        minLength: numSubmissions,
        maxLength: numSubmissions,
      }),
    )
    .map(([siswaId, tenantId, kelasId, tanggal, guruIds, statuses]) => ({
      siswaId,
      tanggal,
      submissions: guruIds.map((guruId, i) => ({
        id: `attempt-${i}`,
        tenant_id: tenantId,
        siswa_id: siswaId,
        kelas_id: kelasId,
        tanggal,
        status: statuses[i],
        guru_id: guruId,
      })),
    }));
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 4: Attendance Uniqueness Per Student Per Day', () => {
  it('at most ONE attendance record exists per student per date after any number of submissions', () => {
    fc.assert(
      fc.property(
        arbitraryDuplicateSubmissions({ submissionCount: 5 }),
        ({ siswaId, tanggal, submissions }) => {
          const store = new AttendanceStore();

          // Insert submissions one by one (simulating multiple attempts)
          for (const submission of submissions) {
            store.insertBatch([submission]);
          }

          // PROPERTY: exactly one record for this student+date
          const records = store.getByStudentAndDate(siswaId, tanggal);
          return records.length === 1;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('multiple submissions for same student+date result in first submission being retained', () => {
    fc.assert(
      fc.property(
        arbitraryDuplicateSubmissions({ submissionCount: 4 }),
        ({ siswaId, tanggal, submissions }) => {
          const store = new AttendanceStore();

          // Insert all submissions
          for (const submission of submissions) {
            store.insertBatch([submission]);
          }

          // PROPERTY: the stored record matches the first submission (first-write-wins)
          const records = store.getByStudentAndDate(siswaId, tanggal);
          return (
            records.length === 1 &&
            records[0].status === submissions[0].status &&
            records[0].guru_id === submissions[0].guru_id
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('different students on the same date can each have their own attendance record', () => {
    fc.assert(
      fc.property(arbitraryClassSubmission({ studentCount: 10 }), (classRecords) => {
        const store = new AttendanceStore();
        store.insertBatch(classRecords);

        const tanggal = classRecords[0].tanggal;
        const uniqueStudentIds = new Set(classRecords.map((r) => r.siswa_id));

        // PROPERTY: each student has exactly one record on this date
        for (const siswaId of uniqueStudentIds) {
          const records = store.getByStudentAndDate(siswaId, tanggal);
          if (records.length !== 1) return false;
        }

        // PROPERTY: total records on this date equals number of unique students
        const dateRecords = store.getByDate(tanggal);
        return dateRecords.length === uniqueStudentIds.size;
      }),
      PBT_CONFIG,
    );
  });

  it('same student on different dates can have separate attendance records', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(), // siswaId
        arbitraryUuid(), // tenantId
        arbitraryUuid(), // kelasId
        arbitraryUuid(), // guruId
        fc.uniqueArray(arbitrarySchoolDate(), { minLength: 2, maxLength: 10 }),
        fc.array(arbitraryAttendanceStatus(), { minLength: 10, maxLength: 10 }),
        (
          siswaId: string,
          tenantId: string,
          kelasId: string,
          guruId: string,
          dates: string[],
          statuses,
        ) => {
          const store = new AttendanceStore();

          // Create one record per date for the same student
          const records: AbsensiRecord[] = dates.map((tanggal, i) => ({
            id: `record-${i}`,
            tenant_id: tenantId,
            siswa_id: siswaId,
            kelas_id: kelasId,
            tanggal,
            status: statuses[i % statuses.length],
            guru_id: guruId,
          }));

          store.insertBatch(records);

          // PROPERTY: student has exactly one record per date
          for (const tanggal of dates) {
            const dateRecords = store.getByStudentAndDate(siswaId, tanggal);
            if (dateRecords.length !== 1) return false;
          }

          // PROPERTY: total records for this student equals number of distinct dates
          const studentRecords = store.getByStudent(siswaId);
          return studentRecords.length === dates.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('batch insert with duplicate student+date pairs only stores the first occurrence', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(), // siswaId
        arbitraryUuid(), // tenantId
        arbitraryUuid(), // kelasId
        arbitrarySchoolDate(),
        fc.array(arbitraryAttendanceStatus(), { minLength: 3, maxLength: 8 }),
        fc.array(arbitraryUuid(), { minLength: 3, maxLength: 8 }),
        (siswaId, tenantId, kelasId, tanggal, statuses, guruIds) => {
          const store = new AttendanceStore();

          // Create a batch with the SAME student+date but different statuses/gurus
          const batchRecords: AbsensiRecord[] = statuses.map((status, i) => ({
            id: `batch-${i}`,
            tenant_id: tenantId,
            siswa_id: siswaId,
            kelas_id: kelasId,
            tanggal,
            status,
            guru_id: guruIds[i % guruIds.length],
          }));

          const inserted = store.insertBatch(batchRecords);

          // PROPERTY: only 1 record inserted despite multiple in batch
          const records = store.getByStudentAndDate(siswaId, tanggal);
          return records.length === 1 && inserted === 1;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('insert count reflects uniqueness: N unique student+date pairs → N insertions from N attempts', () => {
    fc.assert(
      fc.property(arbitraryClassSubmission({ studentCount: 8 }), (classRecords) => {
        const store = new AttendanceStore();

        // First batch: all unique students for one date
        const insertedFirst = store.insertBatch(classRecords);

        // Second batch: same students, same date (all duplicates)
        const insertedSecond = store.insertBatch(classRecords);

        // PROPERTY: first batch inserts all (all unique)
        const uniquePairs = new Set(classRecords.map((r) => `${r.siswa_id}|${r.tanggal}`));
        const firstCorrect = insertedFirst === uniquePairs.size;

        // PROPERTY: second batch inserts zero (all duplicates)
        const secondCorrect = insertedSecond === 0;

        // PROPERTY: total store count unchanged after second batch
        const countCorrect = store.count === uniquePairs.size;

        return firstCorrect && secondCorrect && countCorrect;
      }),
      PBT_CONFIG,
    );
  });
});
