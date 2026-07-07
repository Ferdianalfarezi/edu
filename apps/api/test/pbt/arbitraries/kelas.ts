import fc from 'fast-check';
import { arbitraryUuid } from './common';

// ─── Kelas Types ──────────────────────────────────────────────────────────────

export interface KelasData {
  id: string;
  tenant_id: string;
  tahun_ajaran_id: string;
  nama: string;
  tingkat: number;
  wali_kelas_id: string | null;
  kapasitas: number;
}

// ─── Kelas Arbitraries ────────────────────────────────────────────────────────

/**
 * Generates a valid class (kelas) record.
 */
export function arbitraryKelas(options?: {
  tenantId?: string;
  tahunAjaranId?: string;
}): fc.Arbitrary<KelasData> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: options?.tenantId ? fc.constant(options.tenantId) : arbitraryUuid(),
    tahun_ajaran_id: options?.tahunAjaranId ? fc.constant(options.tahunAjaranId) : arbitraryUuid(),
    nama: fc.constantFrom(
      'I-A',
      'I-B',
      'II-A',
      'II-B',
      'III-A',
      'III-B',
      'IV-A',
      'IV-B',
      'V-A',
      'V-B',
      'VI-A',
      'VI-B',
      'VII-A',
      'VII-B',
      'VIII-A',
      'VIII-B',
      'IX-A',
      'IX-B',
      'X-IPA-1',
      'X-IPA-2',
      'X-IPS-1',
      'XI-IPA-1',
      'XII-IPA-1',
    ),
    tingkat: fc.integer({ min: 1, max: 12 }),
    wali_kelas_id: fc.option(arbitraryUuid(), { nil: null }),
    kapasitas: fc.integer({ min: 20, max: 40 }),
  });
}

/**
 * Generates a list of classes for a tahun ajaran.
 */
export function arbitraryKelasList(
  count: number,
  options?: { tenantId?: string; tahunAjaranId?: string },
): fc.Arbitrary<KelasData[]> {
  return fc.array(arbitraryKelas(options), { minLength: count, maxLength: count });
}
