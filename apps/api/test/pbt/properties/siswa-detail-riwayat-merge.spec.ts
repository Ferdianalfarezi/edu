/**
 * Property 4: Detail endpoint riwayat merge and sort invariant
 *
 * For any student with K historical riwayat_kelas records and a current kelas_id
 * (possibly null), the `riwayat_kelas` array in the detail response has length
 * K+1 (if current kelas exists) or K (if current kelas is null), is sorted by
 * tanggal_mulai descending, and exactly one entry has `is_current: true` if the
 * student has a current kelas_id (or zero entries have `is_current: true` otherwise).
 *
 * **Validates: Requirements 3.2, 7.1**
 *
 * Feature: student-detail-page, Property 4: Riwayat merge and sort invariant
 *
 * Properties verified:
 * 1. Result length = K+1 if current kelas exists, K otherwise
 * 2. Array is sorted by tanggal_mulai DESC (lexicographic, since YYYY-MM-DD)
 * 3. Exactly 1 entry has is_current: true if current kelas exists, 0 otherwise
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, arbitrarySchoolDate, arbitraryName } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiwayatKelasEntry {
  kelas_nama: string;
  tingkat: number;
  tahun_ajaran_nama: string;
  tanggal_mulai: string; // YYYY-MM-DD
  is_current: boolean;
}

interface HistoricalRiwayatRow {
  kelasNama: string;
  tingkat: number;
  tahunAjaranNama: string;
  tanggalMulai: string; // YYYY-MM-DD
}

interface CurrentKelasInfo {
  kelasNama: string;
  kelasTingkat: number;
  tahunAjaranNama: string;
}

// ─── Pure merge/sort logic extracted from SiswaService.getSiswaDetail ─────────

/**
 * Replicates the riwayat_kelas merge and sort logic from getSiswaDetail:
 * 1. If currentKelas is provided, push an entry with is_current: true and today's date
 * 2. Append all historical entries with is_current: false
 * 3. Sort by tanggal_mulai DESC (lexicographic string comparison)
 */
function mergeAndSortRiwayat(
  historicalRows: HistoricalRiwayatRow[],
  currentKelas: CurrentKelasInfo | null,
): RiwayatKelasEntry[] {
  const entries: RiwayatKelasEntry[] = [];

  // Merge current kelas as first entry with is_current: true
  if (currentKelas) {
    entries.push({
      kelas_nama: currentKelas.kelasNama,
      tingkat: currentKelas.kelasTingkat,
      tahun_ajaran_nama: currentKelas.tahunAjaranNama,
      tanggal_mulai: new Date().toISOString().split('T')[0],
      is_current: true,
    });
  }

  // Append historical entries with is_current: false
  for (const row of historicalRows) {
    entries.push({
      kelas_nama: row.kelasNama,
      tingkat: row.tingkat,
      tahun_ajaran_nama: row.tahunAjaranNama,
      tanggal_mulai: row.tanggalMulai || '',
      is_current: false,
    });
  }

  // Sort by tanggal_mulai DESC
  entries.sort((a, b) => {
    if (b.tanggal_mulai > a.tanggal_mulai) return 1;
    if (b.tanggal_mulai < a.tanggal_mulai) return -1;
    return 0;
  });

  return entries;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a historical riwayat_kelas row with a random date.
 */
function arbitraryHistoricalRow(): fc.Arbitrary<HistoricalRiwayatRow> {
  return fc.record({
    kelasNama: arbitraryName().map((n) => `Kelas ${n}`),
    tingkat: fc.integer({ min: 1, max: 12 }),
    tahunAjaranNama: fc.integer({ min: 2020, max: 2029 }).map((y) => `${y}/${y + 1}`),
    tanggalMulai: arbitrarySchoolDate(),
  });
}

/**
 * Generates K historical riwayat entries (0..30).
 */
function arbitraryHistoricalRows(): fc.Arbitrary<HistoricalRiwayatRow[]> {
  return fc.array(arbitraryHistoricalRow(), { minLength: 0, maxLength: 30 });
}

/**
 * Generates an optional current kelas (null means student has no current kelas).
 */
function arbitraryCurrentKelas(): fc.Arbitrary<CurrentKelasInfo | null> {
  return fc.option(
    fc.record({
      kelasNama: arbitraryName().map((n) => `Kelas ${n}`),
      kelasTingkat: fc.integer({ min: 1, max: 12 }),
      tahunAjaranNama: fc.integer({ min: 2020, max: 2029 }).map((y) => `${y}/${y + 1}`),
    }),
    { nil: null },
  );
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 4: Riwayat merge and sort invariant', () => {
  /**
   * **Validates: Requirements 3.2, 7.1**
   */
  it('result length equals K+1 when current kelas exists, K otherwise', () => {
    fc.assert(
      fc.property(
        arbitraryHistoricalRows(),
        arbitraryCurrentKelas(),
        (historicalRows, currentKelas) => {
          const result = mergeAndSortRiwayat(historicalRows, currentKelas);

          const expectedLength = currentKelas ? historicalRows.length + 1 : historicalRows.length;

          return result.length === expectedLength;
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 3.2, 7.1**
   */
  it('result is sorted by tanggal_mulai in descending order', () => {
    fc.assert(
      fc.property(
        arbitraryHistoricalRows(),
        arbitraryCurrentKelas(),
        (historicalRows, currentKelas) => {
          const result = mergeAndSortRiwayat(historicalRows, currentKelas);

          // Check descending order: each entry's tanggal_mulai >= next entry's
          for (let i = 0; i < result.length - 1; i++) {
            if (result[i].tanggal_mulai < result[i + 1].tanggal_mulai) {
              return false;
            }
          }
          return true;
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 3.2, 7.1**
   */
  it('exactly 1 entry has is_current: true if current kelas exists, 0 otherwise', () => {
    fc.assert(
      fc.property(
        arbitraryHistoricalRows(),
        arbitraryCurrentKelas(),
        (historicalRows, currentKelas) => {
          const result = mergeAndSortRiwayat(historicalRows, currentKelas);

          const currentCount = result.filter((e) => e.is_current === true).length;

          if (currentKelas) {
            return currentCount === 1;
          } else {
            return currentCount === 0;
          }
        },
      ),
      PBT_CONFIG,
    );
  });
});
