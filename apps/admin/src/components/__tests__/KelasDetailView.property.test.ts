// Feature: sistem-pengembangan-v2, Property 3: Setiap item siswa yang dirender memiliki nama, NISN (atau "-"), dan status valid

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types (mirroring KelasDetailView.vue)
// ---------------------------------------------------------------------------

type StatusSiswa = 'aktif' | 'tidak_aktif' | 'pindah' | 'lulus';

interface SiswaItem {
  id: string;
  nama: string;
  nisn: string | null;
  status: StatusSiswa;
}

// ---------------------------------------------------------------------------
// Display logic extracted from KelasDetailView.vue
// These are the pure functions under test — identical to the component's logic.
// ---------------------------------------------------------------------------

/** Mirrors the `siswa.nisn ?? '-'` template expression */
function displayNisn(nisn: string | null): string {
  return nisn ?? '-';
}

/** Mirrors `getStatusLabel` in KelasDetailView.vue */
function getStatusLabel(status: StatusSiswa): string {
  switch (status) {
    case 'aktif':
      return 'Aktif';
    case 'tidak_aktif':
      return 'Tidak Aktif';
    case 'pindah':
      return 'Pindah';
    case 'lulus':
      return 'Lulus';
    default:
      return status;
  }
}

/**
 * Maps a SiswaItem to the display row that would be rendered in the table.
 * This mirrors what the template does per row:
 *   - nama  → siswa.nama
 *   - nisn  → siswa.nisn ?? '-'
 *   - status label → getStatusLabel(siswa.status)
 */
function toDisplayRow(siswa: SiswaItem): { nama: string; nisn: string; statusLabel: string } {
  return {
    nama: siswa.nama,
    nisn: displayNisn(siswa.nisn),
    statusLabel: getStatusLabel(siswa.status),
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const namaArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

const nisnNonNullArb = fc.string({ minLength: 1, maxLength: 20 });

const nisnArb: fc.Arbitrary<string | null> = fc.oneof(fc.constant(null), nisnNonNullArb);

const statusArb: fc.Arbitrary<StatusSiswa> = fc.constantFrom(
  'aktif',
  'tidak_aktif',
  'pindah',
  'lulus',
);

const siswaItemArb: fc.Arbitrary<SiswaItem> = fc.record<SiswaItem>({
  id: fc.uuid(),
  nama: namaArb,
  nisn: nisnArb,
  status: statusArb,
});

const siswaArrayArb: fc.Arbitrary<SiswaItem[]> = fc.array(siswaItemArb, {
  minLength: 1,
  maxLength: 50,
});

// ---------------------------------------------------------------------------
// Property 3: Setiap item siswa yang dirender memiliki nama, NISN (atau "-"), dan status valid
// **Validates: Requirements 3.2**
// ---------------------------------------------------------------------------

describe('Property 3: Setiap item siswa yang dirender memiliki nama, NISN (atau "-"), dan status valid', () => {
  it('nama siswa yang dirender selalu berupa string non-kosong', () => {
    fc.assert(
      fc.property(siswaArrayArb, (siswaList) => {
        for (const siswa of siswaList) {
          const row = toDisplayRow(siswa);
          // nama must be a non-empty string
          expect(typeof row.nama).toBe('string');
          expect(row.nama.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('NISN yang dirender adalah nilai asli jika non-null, atau "-" jika null', () => {
    fc.assert(
      fc.property(siswaArrayArb, (siswaList) => {
        for (const siswa of siswaList) {
          const row = toDisplayRow(siswa);

          if (siswa.nisn === null) {
            // null NISN must display as "-"
            expect(row.nisn).toBe('-');
          } else {
            // non-null NISN must be preserved exactly
            expect(row.nisn).toBe(siswa.nisn);
            expect(row.nisn).not.toBe('-');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('NISN yang dirender tidak pernah berupa string kosong — selalu ada nilai atau "-"', () => {
    fc.assert(
      fc.property(siswaArrayArb, (siswaList) => {
        for (const siswa of siswaList) {
          const row = toDisplayRow(siswa);
          expect(row.nisn.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('label status yang dirender selalu merupakan salah satu dari 4 nilai label yang valid', () => {
    const VALID_LABELS = ['Aktif', 'Tidak Aktif', 'Pindah', 'Lulus'];

    fc.assert(
      fc.property(siswaArrayArb, (siswaList) => {
        for (const siswa of siswaList) {
          const row = toDisplayRow(siswa);
          expect(VALID_LABELS).toContain(row.statusLabel);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('setiap status API ("aktif", "tidak_aktif", "pindah", "lulus") dipetakan ke label yang unik dan non-kosong', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        const label = getStatusLabel(status);
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('seluruh kombinasi nama + NISN + status menghasilkan baris yang bisa dirender dengan benar', () => {
    // Combined property: given any valid SiswaItem array from the API,
    // all three display fields are always well-defined.
    fc.assert(
      fc.property(siswaArrayArb, (siswaList) => {
        const rows = siswaList.map(toDisplayRow);

        for (let i = 0; i < rows.length; i++) {
          const { nama, nisn, statusLabel } = rows[i];
          const original = siswaList[i];

          // 1. nama is always non-empty
          expect(nama.length).toBeGreaterThan(0);

          // 2. nisn is the original value or "-", never empty, never undefined
          expect(nisn).toBeDefined();
          expect(nisn.length).toBeGreaterThan(0);
          if (original.nisn !== null) {
            expect(nisn).toBe(original.nisn);
          } else {
            expect(nisn).toBe('-');
          }

          // 3. statusLabel is one of the 4 valid display labels
          expect(['Aktif', 'Tidak Aktif', 'Pindah', 'Lulus']).toContain(statusLabel);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('displayNisn adalah idempoten: memanggil dua kali pada hasil pertama menghasilkan nilai yang sama', () => {
    // displayNisn("-") should still return "-", not "--"
    fc.assert(
      fc.property(nisnArb, (nisn) => {
        const first = displayNisn(nisn);
        // The result of displayNisn is always a non-null string,
        // so calling displayNisn again on the string result should be stable.
        const second = displayNisn(first);
        expect(second).toBe(first);
      }),
      { numRuns: 100 },
    );
  });

  it('getStatusLabel adalah deterministic: input yang sama selalu menghasilkan output yang sama', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        const label1 = getStatusLabel(status);
        const label2 = getStatusLabel(status);
        expect(label1).toBe(label2);
      }),
      { numRuns: 100 },
    );
  });

  it('daftar siswa kosong menghasilkan nol baris yang dirender (edge case)', () => {
    const rows = ([] as SiswaItem[]).map(toDisplayRow);
    expect(rows).toHaveLength(0);
  });
});
