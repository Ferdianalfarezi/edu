import fc from 'fast-check';
import {
  arbitraryUuid,
  arbitraryAttendanceStatus,
  arbitrarySchoolDate,
  type AttendanceStatus,
} from './common';

// ─── Absensi Types ────────────────────────────────────────────────────────────

export interface AbsensiRecord {
  id: string;
  tenant_id: string;
  siswa_id: string;
  kelas_id: string;
  tanggal: string;
  status: AttendanceStatus;
  guru_id: string;
}

export interface AbsensiInput {
  siswa_id: string;
  status: AttendanceStatus;
}

export interface AbsensiSubmission {
  kelas_id: string;
  tanggal: string;
  guru_id: string;
  records: AbsensiInput[];
}

// ─── Absensi Arbitraries ──────────────────────────────────────────────────────

/**
 * Generates a single attendance record.
 */
export function arbitraryAbsensiRecord(options?: {
  tenantId?: string;
  kelasId?: string;
  siswaId?: string;
  guruId?: string;
}): fc.Arbitrary<AbsensiRecord> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: options?.tenantId ? fc.constant(options.tenantId) : arbitraryUuid(),
    siswa_id: options?.siswaId ? fc.constant(options.siswaId) : arbitraryUuid(),
    kelas_id: options?.kelasId ? fc.constant(options.kelasId) : arbitraryUuid(),
    tanggal: arbitrarySchoolDate(),
    status: arbitraryAttendanceStatus(),
    guru_id: options?.guruId ? fc.constant(options.guruId) : arbitraryUuid(),
  });
}

/**
 * Generates attendance input for a single student.
 */
export function arbitraryAbsensiInput(siswaId?: string): fc.Arbitrary<AbsensiInput> {
  return fc.record({
    siswa_id: siswaId ? fc.constant(siswaId) : arbitraryUuid(),
    status: arbitraryAttendanceStatus(),
  });
}

/**
 * Generates a complete attendance submission for a class.
 * Each student in siswaIds gets exactly one status.
 */
export function arbitraryAbsensiSubmission(
  siswaIds: string[],
  options?: { kelasId?: string; guruId?: string },
): fc.Arbitrary<AbsensiSubmission> {
  const recordArbitraries = siswaIds.map((id) =>
    arbitraryAttendanceStatus().map((status) => ({ siswa_id: id, status })),
  );

  const recordsArbitrary =
    recordArbitraries.length > 0
      ? (fc.tuple as any)(...recordArbitraries).map((arr: AbsensiInput[]) => arr)
      : fc.constant([]);

  return fc.record({
    kelas_id: options?.kelasId ? fc.constant(options.kelasId) : arbitraryUuid(),
    tanggal: arbitrarySchoolDate(),
    guru_id: options?.guruId ? fc.constant(options.guruId) : arbitraryUuid(),
    records: recordsArbitrary as fc.Arbitrary<AbsensiInput[]>,
  });
}

/**
 * Generates a partial attendance submission (missing some students).
 * Useful for testing completeness validation (Property 3).
 */
export function arbitraryPartialAbsensiSubmission(
  allSiswaIds: string[],
  options?: { kelasId?: string; guruId?: string },
): fc.Arbitrary<AbsensiSubmission> {
  return fc
    .subarray(allSiswaIds, { minLength: 0, maxLength: Math.max(0, allSiswaIds.length - 1) })
    .chain((subset) => arbitraryAbsensiSubmission(subset, options));
}

/**
 * Generates attendance records for a period (month).
 * Returns records for multiple days within the month.
 */
export function arbitraryMonthAttendance(options: {
  siswaId: string;
  kelasId: string;
  tenantId: string;
  bulan: number;
  tahun: number;
  daysCount: number;
}): fc.Arbitrary<AbsensiRecord[]> {
  return fc
    .array(arbitraryAttendanceStatus(), {
      minLength: options.daysCount,
      maxLength: options.daysCount,
    })
    .map((statuses) =>
      statuses.map((status, idx) => ({
        id: `${options.siswaId}-${idx}`,
        tenant_id: options.tenantId,
        siswa_id: options.siswaId,
        kelas_id: options.kelasId,
        tanggal: `${options.tahun}-${String(options.bulan).padStart(2, '0')}-${String(idx + 1).padStart(2, '0')}`,
        status,
        guru_id: 'guru-placeholder',
      })),
    );
}
