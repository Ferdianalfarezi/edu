// Feature: sistem-pengembangan-v2, Property 6: Semua kombinasi di mana >=1 field wajib kosong → form menolak + error inline

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateBarangForm,
  KONDISI_BARANG_VALUES,
  SUMBER_DANA_VALUES,
  KATEGORI_VALUES,
  type BarangFormInput,
} from '@/utils/barang-validation';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Nilai enum yang valid untuk setiap field */
const kondisiBarangValidArb = fc.constantFrom(...KONDISI_BARANG_VALUES);
const sumberDanaValidArb = fc.constantFrom(...SUMBER_DANA_VALUES);
const kategoriValidArb = fc.constantFrom(...KATEGORI_VALUES);

/** Nilai "kosong" yang merepresentasikan field tidak diisi */
const emptyValueArb = fc.constantFrom<string | null | undefined>('', null, undefined);

// ---------------------------------------------------------------------------
// Property 6: Semua kombinasi di mana ≥1 field wajib kosong → form menolak + error inline
// **Validates: Requirements 5.5**
// ---------------------------------------------------------------------------

describe('Property 6: form inventaris menolak kombinasi field wajib kosong', () => {
  // Feature: sistem-pengembangan-v2, Property 6: Semua kombinasi di mana >=1 field wajib kosong → form menolak + error inline

  /**
   * SUB-TEST A: Ketiga field kosong semua (1 dari 7 kombinasi invalid)
   * Memverifikasi kasus paling jelas: form kosong sama sekali ditolak dengan error di semua field.
   */
  it('menolak form ketika semua 3 field wajib kosong', () => {
    fc.assert(
      fc.property(emptyValueArb, emptyValueArb, emptyValueArb, (kondisi, sumber, kategori) => {
        const result = validateBarangForm({
          kondisi_barang: kondisi,
          sumber_dana: sumber,
          kategori: kategori,
        });

        // Form harus ditolak
        expect(result.valid).toBe(false);

        // Semua 3 field harus memiliki error inline
        expect(result.errors.kondisi_barang).toBeTruthy();
        expect(result.errors.sumber_dana).toBeTruthy();
        expect(result.errors.kategori).toBeTruthy();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST B: hanya kondisi_barang kosong (1 dari 7 kombinasi invalid)
   * Field lain valid → hanya kondisi_barang memiliki error.
   */
  it('menolak form ketika hanya kondisi_barang kosong', () => {
    fc.assert(
      fc.property(
        emptyValueArb,
        sumberDanaValidArb,
        kategoriValidArb,
        (kondisi, sumber, kategori) => {
          const result = validateBarangForm({
            kondisi_barang: kondisi,
            sumber_dana: sumber,
            kategori: kategori,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.kondisi_barang).toBeTruthy();
          // Field lain tidak boleh ada error
          expect(result.errors.sumber_dana).toBeFalsy();
          expect(result.errors.kategori).toBeFalsy();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST C: hanya sumber_dana kosong (1 dari 7 kombinasi invalid)
   * Field lain valid → hanya sumber_dana memiliki error.
   */
  it('menolak form ketika hanya sumber_dana kosong', () => {
    fc.assert(
      fc.property(
        kondisiBarangValidArb,
        emptyValueArb,
        kategoriValidArb,
        (kondisi, sumber, kategori) => {
          const result = validateBarangForm({
            kondisi_barang: kondisi,
            sumber_dana: sumber,
            kategori: kategori,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.sumber_dana).toBeTruthy();
          expect(result.errors.kondisi_barang).toBeFalsy();
          expect(result.errors.kategori).toBeFalsy();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST D: hanya kategori kosong (1 dari 7 kombinasi invalid)
   * Field lain valid → hanya kategori memiliki error.
   */
  it('menolak form ketika hanya kategori kosong', () => {
    fc.assert(
      fc.property(
        kondisiBarangValidArb,
        sumberDanaValidArb,
        emptyValueArb,
        (kondisi, sumber, kategori) => {
          const result = validateBarangForm({
            kondisi_barang: kondisi,
            sumber_dana: sumber,
            kategori: kategori,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.kategori).toBeTruthy();
          expect(result.errors.kondisi_barang).toBeFalsy();
          expect(result.errors.sumber_dana).toBeFalsy();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST E: kondisi_barang dan sumber_dana kosong, kategori valid (1 dari 7 kombinasi invalid)
   */
  it('menolak form ketika kondisi_barang dan sumber_dana kosong', () => {
    fc.assert(
      fc.property(emptyValueArb, emptyValueArb, kategoriValidArb, (kondisi, sumber, kategori) => {
        const result = validateBarangForm({
          kondisi_barang: kondisi,
          sumber_dana: sumber,
          kategori: kategori,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.kondisi_barang).toBeTruthy();
        expect(result.errors.sumber_dana).toBeTruthy();
        expect(result.errors.kategori).toBeFalsy();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST F: kondisi_barang dan kategori kosong, sumber_dana valid (1 dari 7 kombinasi invalid)
   */
  it('menolak form ketika kondisi_barang dan kategori kosong', () => {
    fc.assert(
      fc.property(emptyValueArb, sumberDanaValidArb, emptyValueArb, (kondisi, sumber, kategori) => {
        const result = validateBarangForm({
          kondisi_barang: kondisi,
          sumber_dana: sumber,
          kategori: kategori,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.kondisi_barang).toBeTruthy();
        expect(result.errors.kategori).toBeTruthy();
        expect(result.errors.sumber_dana).toBeFalsy();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST G: sumber_dana dan kategori kosong, kondisi_barang valid (1 dari 7 kombinasi invalid)
   */
  it('menolak form ketika sumber_dana dan kategori kosong', () => {
    fc.assert(
      fc.property(
        kondisiBarangValidArb,
        emptyValueArb,
        emptyValueArb,
        (kondisi, sumber, kategori) => {
          const result = validateBarangForm({
            kondisi_barang: kondisi,
            sumber_dana: sumber,
            kategori: kategori,
          });

          expect(result.valid).toBe(false);
          expect(result.errors.sumber_dana).toBeTruthy();
          expect(result.errors.kategori).toBeTruthy();
          expect(result.errors.kondisi_barang).toBeFalsy();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST H (kontras): semua field valid → form diterima tanpa error (2^3 kasus positif)
   * Memastikan validasi tidak terlalu ketat.
   */
  it('menerima form ketika semua 3 field wajib diisi dengan nilai enum yang valid', () => {
    fc.assert(
      fc.property(
        kondisiBarangValidArb,
        sumberDanaValidArb,
        kategoriValidArb,
        (kondisi, sumber, kategori) => {
          const result = validateBarangForm({
            kondisi_barang: kondisi,
            sumber_dana: sumber,
            kategori: kategori,
          });

          expect(result.valid).toBe(true);
          expect(Object.keys(result.errors)).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * SUB-TEST I (generalisasi): property universal — ≥1 field kosong → valid selalu false
   * Menggunakan fc.boolean untuk memilih secara acak field mana yang kosong,
   * dengan constraint bahwa minimal 1 harus kosong.
   */
  it('property universal: setiap kombinasi dengan ≥1 field kosong menghasilkan valid=false dan error per field kosong', () => {
    // Arbitrary yang menghasilkan bitmask: 3-bit integer 1..7 (0 = semua valid, dikecualikan)
    const invalidMaskArb = fc.integer({ min: 1, max: 7 }); // bit 0=kondisi, bit 1=sumber, bit 2=kategori

    fc.assert(
      fc.property(
        invalidMaskArb,
        emptyValueArb,
        kondisiBarangValidArb,
        sumberDanaValidArb,
        kategoriValidArb,
        (mask, emptyVal, validKondisi, validSumber, validKategori) => {
          const kondisiIsEmpty = (mask & 1) !== 0;
          const sumberIsEmpty = (mask & 2) !== 0;
          const kategoriIsEmpty = (mask & 4) !== 0;

          const form: BarangFormInput = {
            kondisi_barang: kondisiIsEmpty ? emptyVal : validKondisi,
            sumber_dana: sumberIsEmpty ? emptyVal : validSumber,
            kategori: kategoriIsEmpty ? emptyVal : validKategori,
          };

          const result = validateBarangForm(form);

          // Form HARUS ditolak karena ada ≥1 field kosong
          expect(result.valid).toBe(false);

          // Setiap field yang kosong HARUS memiliki pesan error inline
          if (kondisiIsEmpty) expect(result.errors.kondisi_barang).toBeTruthy();
          if (sumberIsEmpty) expect(result.errors.sumber_dana).toBeTruthy();
          if (kategoriIsEmpty) expect(result.errors.kategori).toBeTruthy();

          // Field yang TIDAK kosong TIDAK boleh memiliki error
          if (!kondisiIsEmpty) expect(result.errors.kondisi_barang).toBeFalsy();
          if (!sumberIsEmpty) expect(result.errors.sumber_dana).toBeFalsy();
          if (!kategoriIsEmpty) expect(result.errors.kategori).toBeFalsy();
        },
      ),
      { numRuns: 500 },
    );
  });
});
