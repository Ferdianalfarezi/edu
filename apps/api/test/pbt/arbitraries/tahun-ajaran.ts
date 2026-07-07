import fc from 'fast-check';
import { arbitraryUuid, arbitraryTahunAjaranStatus, type TahunAjaranStatus } from './common';

// ─── Tahun Ajaran Types ───────────────────────────────────────────────────────

export interface TahunAjaranData {
  id: string;
  tenant_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  status: TahunAjaranStatus;
}

// ─── Tahun Ajaran Arbitraries ─────────────────────────────────────────────────

/**
 * Generates a valid academic year (tahun ajaran).
 * Ensures tanggal_mulai < tanggal_selesai with roughly 10-12 months span.
 */
export function arbitraryTahunAjaran(options?: {
  tenantId?: string;
  status?: TahunAjaranStatus;
}): fc.Arbitrary<TahunAjaranData> {
  const academicYears = [
    { nama: '2023/2024', start: '2023-07-17', end: '2024-06-14' },
    { nama: '2024/2025', start: '2024-07-15', end: '2025-06-13' },
    { nama: '2025/2026', start: '2025-07-14', end: '2026-06-12' },
    { nama: '2026/2027', start: '2026-07-13', end: '2027-06-11' },
  ];

  return fc.constantFrom(...academicYears).chain((year) =>
    fc.record({
      id: arbitraryUuid(),
      tenant_id: options?.tenantId ? fc.constant(options.tenantId) : arbitraryUuid(),
      nama: fc.constant(year.nama),
      tanggal_mulai: fc.constant(year.start),
      tanggal_selesai: fc.constant(year.end),
      status: options?.status ? fc.constant(options.status) : arbitraryTahunAjaranStatus(),
    }),
  );
}

/**
 * Generates a month within a given tahun ajaran's date range.
 * Returns { bulan: number (1-12), tahun: number }
 */
export function arbitraryMonthInTahunAjaran(
  tahunAjaran: TahunAjaranData,
): fc.Arbitrary<{ bulan: number; tahun: number }> {
  const start = new Date(tahunAjaran.tanggal_mulai);
  const end = new Date(tahunAjaran.tanggal_selesai);

  const months: { bulan: number; tahun: number }[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    months.push({ bulan: current.getMonth() + 1, tahun: current.getFullYear() });
    current.setMonth(current.getMonth() + 1);
  }

  if (months.length === 0) {
    months.push({ bulan: start.getMonth() + 1, tahun: start.getFullYear() });
  }

  return fc.constantFrom(...months);
}
