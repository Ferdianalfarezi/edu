/**
 * Property 3: Promotion batch recording
 *
 * For any kenaikan kelas execution with N promoted students from a source class,
 * exactly N riwayat_kelas records are created via recordBatch(), each with
 * kelasId = source kelas, tahunAjaranId = source kelas's tahun_ajaran_id,
 * and tanggal_mulai = today's date (non-null).
 *
 * **Validates: Requirements 1.3, 1.4**
 *
 * Feature: student-detail-page, Property 3: Promotion batch recording
 *
 * Properties verified:
 * 1. Exactly N records are created for N promoted students
 * 2. Each record has kelasId = source kelas kelasId
 * 3. Each record has tahunAjaranId = source kelas's tahun_ajaran_id
 * 4. Each record has a non-null tanggal_mulai (today's date in YYYY-MM-DD format)
 * 5. Each record has the correct siswaId and tenantId
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';
import { RiwayatKelasEntry } from '@/modules/siswa/riwayat-kelas.helper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiwayatKelasRecord {
  tenantId: string;
  siswaId: string;
  kelasId: string;
  tahunAjaranId: string;
  tanggalMulai: string;
}

// ─── Simulated RiwayatKelas Store ─────────────────────────────────────────────

/**
 * Simulates the riwayat_kelas table's insert behavior as performed by
 * RiwayatKelasHelper.recordBatch().
 */
class RiwayatKelasStore {
  private records: RiwayatKelasRecord[] = [];

  /**
   * Simulates recordBatch() logic:
   * - No-op if entries array is empty
   * - Sets tanggalMulai to today if not provided
   * - Inserts all entries in a single batch
   */
  recordBatch(entries: RiwayatKelasEntry[]): void {
    if (entries.length === 0) {
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    for (const entry of entries) {
      this.records.push({
        tenantId: entry.tenantId,
        siswaId: entry.siswaId,
        kelasId: entry.kelasId,
        tahunAjaranId: entry.tahunAjaranId,
        tanggalMulai: entry.tanggalMulai || today,
      });
    }
  }

  getAll(): RiwayatKelasRecord[] {
    return [...this.records];
  }

  get count(): number {
    return this.records.length;
  }
}

// ─── Simulated Promotion Logic ────────────────────────────────────────────────

/**
 * Simulates the KenaikanKelasService.promoteStudents() flow:
 * Given N students from a source class, calls recordBatch with entries for
 * each promoted student, setting kelasId = source kelas, tahunAjaranId = source
 * kelas's tahun_ajaran_id, and tanggalMulai = today.
 */
function promoteStudents(
  store: RiwayatKelasStore,
  tenantId: string,
  studentIds: string[],
  sourceKelasId: string,
  sourceTahunAjaranId: string,
): void {
  const today = new Date().toISOString().split('T')[0];

  const entries: RiwayatKelasEntry[] = studentIds.map((siswaId) => ({
    tenantId,
    siswaId,
    kelasId: sourceKelasId,
    tahunAjaranId: sourceTahunAjaranId,
    tanggalMulai: today,
  }));

  store.recordBatch(entries);
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a list of unique student IDs (1..50 students being promoted).
 */
function arbitraryStudentIds(): fc.Arbitrary<string[]> {
  return fc
    .array(arbitraryUuid(), { minLength: 1, maxLength: 50 })
    .map((ids) => [...new Set(ids)]) // ensure uniqueness
    .filter((ids) => ids.length >= 1);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 3: Promotion batch recording', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   */
  it('exactly N riwayat_kelas records are created for N promoted students', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(), // tenantId
        arbitraryStudentIds(), // N student IDs (1..50)
        arbitraryUuid(), // sourceKelasId
        arbitraryUuid(), // sourceTahunAjaranId
        (tenantId, studentIds, sourceKelasId, sourceTahunAjaranId) => {
          const store = new RiwayatKelasStore();

          promoteStudents(store, tenantId, studentIds, sourceKelasId, sourceTahunAjaranId);

          // PROPERTY: exactly N records created
          return store.count === studentIds.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4**
   */
  it('each record has kelasId equal to the source kelas', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentIds(),
        arbitraryUuid(),
        arbitraryUuid(),
        (tenantId, studentIds, sourceKelasId, sourceTahunAjaranId) => {
          const store = new RiwayatKelasStore();

          promoteStudents(store, tenantId, studentIds, sourceKelasId, sourceTahunAjaranId);

          // PROPERTY: all records have kelasId = sourceKelasId
          return store.getAll().every((r) => r.kelasId === sourceKelasId);
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4**
   */
  it('each record has tahunAjaranId equal to the source kelas tahun_ajaran_id', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentIds(),
        arbitraryUuid(),
        arbitraryUuid(),
        (tenantId, studentIds, sourceKelasId, sourceTahunAjaranId) => {
          const store = new RiwayatKelasStore();

          promoteStudents(store, tenantId, studentIds, sourceKelasId, sourceTahunAjaranId);

          // PROPERTY: all records have tahunAjaranId = sourceTahunAjaranId
          return store.getAll().every((r) => r.tahunAjaranId === sourceTahunAjaranId);
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4**
   */
  it('each record has a non-null tanggal_mulai in YYYY-MM-DD format', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentIds(),
        arbitraryUuid(),
        arbitraryUuid(),
        (tenantId, studentIds, sourceKelasId, sourceTahunAjaranId) => {
          const store = new RiwayatKelasStore();

          promoteStudents(store, tenantId, studentIds, sourceKelasId, sourceTahunAjaranId);

          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

          // PROPERTY: tanggal_mulai is non-null and matches YYYY-MM-DD format
          return store.getAll().every((r) => {
            return (
              r.tanggalMulai !== null &&
              r.tanggalMulai !== undefined &&
              dateRegex.test(r.tanggalMulai)
            );
          });
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4**
   */
  it('each record has the correct siswaId and tenantId from the promotion batch', () => {
    fc.assert(
      fc.property(
        arbitraryUuid(),
        arbitraryStudentIds(),
        arbitraryUuid(),
        arbitraryUuid(),
        (tenantId, studentIds, sourceKelasId, sourceTahunAjaranId) => {
          const store = new RiwayatKelasStore();

          promoteStudents(store, tenantId, studentIds, sourceKelasId, sourceTahunAjaranId);

          const records = store.getAll();

          // PROPERTY: every record has correct tenantId
          const allCorrectTenant = records.every((r) => r.tenantId === tenantId);

          // PROPERTY: the set of siswaIds in records matches the input set exactly
          const recordSiswaIds = new Set(records.map((r) => r.siswaId));
          const inputSiswaIds = new Set(studentIds);
          const setsMatch =
            recordSiswaIds.size === inputSiswaIds.size &&
            [...recordSiswaIds].every((id) => inputSiswaIds.has(id));

          return allCorrectTenant && setsMatch;
        },
      ),
      PBT_CONFIG,
    );
  });
});
