import fc from 'fast-check';
import { arbitraryUuid } from './common';

// ─── Mata Pelajaran Types ─────────────────────────────────────────────────────

export interface MataPelajaranData {
  id: string;
  tenant_id: string;
  nama: string;
  kode: string;
}

// ─── Mata Pelajaran Arbitraries ───────────────────────────────────────────────

const SUBJECTS = [
  { nama: 'Matematika', kode: 'MTK' },
  { nama: 'Bahasa Indonesia', kode: 'BIND' },
  { nama: 'Bahasa Inggris', kode: 'BING' },
  { nama: 'IPA', kode: 'IPA' },
  { nama: 'IPS', kode: 'IPS' },
  { nama: 'PKN', kode: 'PKN' },
  { nama: 'Pendidikan Agama Islam', kode: 'PAI' },
  { nama: 'Seni Budaya', kode: 'SENBUD' },
  { nama: 'PJOK', kode: 'PJOK' },
  { nama: 'Informatika', kode: 'INF' },
  { nama: 'Prakarya', kode: 'PRKR' },
] as const;

/**
 * Generates a valid subject (mata pelajaran).
 */
export function arbitraryMataPelajaran(options?: {
  tenantId?: string;
}): fc.Arbitrary<MataPelajaranData> {
  return fc.constantFrom(...SUBJECTS).chain((subject) =>
    fc.record({
      id: arbitraryUuid(),
      tenant_id: options?.tenantId ? fc.constant(options.tenantId) : arbitraryUuid(),
      nama: fc.constant(subject.nama),
      kode: fc.constant(subject.kode),
    }),
  );
}
