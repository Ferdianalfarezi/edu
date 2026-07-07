import fc from 'fast-check';
import {
  arbitraryUuid,
  arbitraryName,
  arbitraryNisn,
  arbitraryStudentStatus,
  type StudentStatus,
} from './common';

// ─── Siswa Types ──────────────────────────────────────────────────────────────

export interface SiswaData {
  id: string;
  tenant_id: string;
  kelas_id: string;
  nisn: string;
  nama: string;
  jenis_kelamin: 'L' | 'P';
  tanggal_lahir: string;
  status: StudentStatus;
  orang_tua_id: string;
}

// ─── Siswa Arbitraries ────────────────────────────────────────────────────────

/**
 * Generates a valid student (siswa) record.
 */
export function arbitrarySiswa(options?: {
  tenantId?: string;
  kelasId?: string;
  orangTuaId?: string;
}): fc.Arbitrary<SiswaData> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: options?.tenantId ? fc.constant(options.tenantId) : arbitraryUuid(),
    kelas_id: options?.kelasId ? fc.constant(options.kelasId) : arbitraryUuid(),
    nisn: arbitraryNisn(),
    nama: arbitraryName(),
    jenis_kelamin: fc.constantFrom<'L' | 'P'>('L', 'P'),
    tanggal_lahir: fc
      .date({ min: new Date('2005-01-01'), max: new Date('2018-12-31') })
      .map((d) => d.toISOString().split('T')[0]),
    status: fc.constant('aktif' as const),
    orang_tua_id: options?.orangTuaId ? fc.constant(options.orangTuaId) : arbitraryUuid(),
  });
}

/**
 * Generates a list of active students for a class.
 * Useful for attendance completeness tests.
 */
export function arbitrarySiswaList(
  count: number,
  options?: { tenantId?: string; kelasId?: string },
): fc.Arbitrary<SiswaData[]> {
  return fc.array(arbitrarySiswa(options), { minLength: count, maxLength: count });
}

/**
 * Generates between 1 and maxCount students for a class.
 */
export function arbitrarySiswaListVariable(
  minCount: number = 1,
  maxCount: number = 40,
  options?: { tenantId?: string; kelasId?: string },
): fc.Arbitrary<SiswaData[]> {
  return fc.array(arbitrarySiswa(options), { minLength: minCount, maxLength: maxCount });
}
