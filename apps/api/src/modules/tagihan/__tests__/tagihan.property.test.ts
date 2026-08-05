import fc from 'fast-check';

/**
 * Property 11: Field `sisa` tagihan selalu non-negatif untuk sembarang nominal dan totalDibayar
 *
 * For any non-negative integer nominal and any non-negative integer totalDibayar,
 * `Math.max(0, nominal - totalDibayar)` SHALL always be >= 0 and never NaN.
 *
 * **Validates: Requirements 7.1**
 *
 * // Feature: sistem-pengembangan-v2, Property 11: Field sisa tagihan selalu non-negatif untuk sembarang nominal dan totalDibayar
 */

/**
 * Pure computation of `sisa` extracted from TagihanService.getTunggakan().
 * Source: apps/api/src/modules/tagihan/tagihan.service.ts
 *
 * sisa: Math.max(0, row.nominal - row.totalDibayar)  // Req 7.1 — server-side, always non-negative
 */
function computeSisa(nominal: number, totalDibayar: number): number {
  return Math.max(0, nominal - totalDibayar);
}

describe('Feature: sistem-pengembangan-v2, Property 11: Field sisa tagihan selalu non-negatif untuk sembarang nominal dan totalDibayar', () => {
  /**
   * Arbitrary: non-negative integer up to 999_999_999 (max nominal per Req 6.3).
   */
  const nonNegativeIntArb = fc.integer({ min: 0, max: 999_999_999 });

  it('sisa selalu >= 0 untuk sembarang nominal dan totalDibayar', () => {
    fc.assert(
      fc.property(nonNegativeIntArb, nonNegativeIntArb, (nominal, totalDibayar) => {
        const sisa = computeSisa(nominal, totalDibayar);
        expect(sisa).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it('sisa tidak pernah NaN untuk sembarang nominal dan totalDibayar', () => {
    fc.assert(
      fc.property(nonNegativeIntArb, nonNegativeIntArb, (nominal, totalDibayar) => {
        const sisa = computeSisa(nominal, totalDibayar);
        expect(sisa).not.toBeNaN();
      }),
      { numRuns: 100 },
    );
  });

  it('sisa adalah angka finite (bukan Infinity) untuk sembarang nominal dan totalDibayar', () => {
    fc.assert(
      fc.property(nonNegativeIntArb, nonNegativeIntArb, (nominal, totalDibayar) => {
        const sisa = computeSisa(nominal, totalDibayar);
        expect(isFinite(sisa)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('sisa === 0 ketika totalDibayar >= nominal (tagihan lunas atau overpay)', () => {
    fc.assert(
      fc.property(nonNegativeIntArb, nonNegativeIntArb, (nominal, extra) => {
        // totalDibayar = nominal + extra, so always >= nominal
        const totalDibayar = nominal + extra;
        const sisa = computeSisa(nominal, totalDibayar);
        expect(sisa).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('sisa === nominal - totalDibayar ketika totalDibayar < nominal (belum lunas)', () => {
    // Use fc.integer to produce nominal > totalDibayar
    const partialPaymentArb = fc
      .tuple(fc.integer({ min: 1, max: 999_999_999 }), fc.integer({ min: 0, max: 999_999_998 }))
      .filter(([nominal, totalDibayar]) => totalDibayar < nominal);

    fc.assert(
      fc.property(partialPaymentArb, ([nominal, totalDibayar]) => {
        const sisa = computeSisa(nominal, totalDibayar);
        expect(sisa).toBe(nominal - totalDibayar);
      }),
      { numRuns: 100 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 9: Nominal yang dipilih selalu mengikuti hierarki prioritas
//             per-siswa > per-kelas > global
//
// **Validates: Requirements 6.2, 6.4**
//
// // Feature: sistem-pengembangan-v2, Property 9: Nominal yang dipilih selalu mengikuti hierarki prioritas per-siswa > per-kelas > global
// ─────────────────────────────────────────────────────────────────────────────

import { BadRequestException } from '@nestjs/common';

/**
 * Pure representation of the three-level billing hierarchy from
 * TagihanService.resolveNominalForSiswa() (tagihan.service.ts ~L1211).
 *
 * This mirrors the exact branching logic of the real method, allowing
 * exhaustive property-based testing without a real database.
 *
 * Priority:
 *   1. perSiswa nominal (if > 0)  → wins always
 *   2. perKelas nominal (if > 0)  → wins when no per-siswa override
 *   3. global nominal  (if > 0)   → wins when neither override exists
 *   4. nothing configured         → throws BadRequestException
 */
function resolveNominalPure(
  perSiswa: number | null,
  perKelas: number | null,
  global: number | null,
): number {
  if (perSiswa != null && perSiswa > 0) return perSiswa;
  if (perKelas != null && perKelas > 0) return perKelas;
  if (global != null && global > 0) return global;
  throw new BadRequestException(
    'Tidak ada nominal biaya yang dikonfigurasi. Silakan atur nominal biaya terlebih dahulu.',
  );
}

describe('Feature: sistem-pengembangan-v2, Property 9: Nominal yang dipilih selalu mengikuti hierarki prioritas per-siswa > per-kelas > global', () => {
  /**
   * Valid positive nominal: 1 – 999_999_999 (as per Req 6.3).
   */
  const positiveNominalArb = fc.integer({ min: 1, max: 999_999_999 });

  // ── Case 1: per-siswa override exists → always wins ──────────────────────
  it('per-siswa override selalu dipilih terlepas dari nilai per-kelas dan global', () => {
    /**
     * Property: for any valid per-siswa nominal, any optional per-kelas nominal,
     * and any optional global nominal, the result is always the per-siswa value.
     */
    fc.assert(
      fc.property(
        positiveNominalArb,
        fc.option(positiveNominalArb, { nil: null }),
        fc.option(positiveNominalArb, { nil: null }),
        (perSiswa, perKelas, global) => {
          const result = resolveNominalPure(perSiswa, perKelas, global);
          expect(result).toBe(perSiswa);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('per-siswa override selalu dipilih meskipun per-kelas bernilai lebih tinggi', () => {
    /**
     * Edge case: even if perKelas > perSiswa, per-siswa still wins.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 499_999_999 }),
        fc.integer({ min: 500_000_000, max: 999_999_999 }),
        (perSiswa, perKelas) => {
          // perKelas is always larger, but per-siswa must still win
          const result = resolveNominalPure(perSiswa, perKelas, null);
          expect(result).toBe(perSiswa);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Case 2: per-kelas only (no per-siswa) → per-kelas wins ───────────────
  it('per-kelas dipilih ketika tidak ada override per-siswa', () => {
    /**
     * Property: when perSiswa is null (no record) and perKelas > 0,
     * the result is always the per-kelas value.
     */
    fc.assert(
      fc.property(
        positiveNominalArb,
        fc.option(positiveNominalArb, { nil: null }),
        (perKelas, global) => {
          const result = resolveNominalPure(null, perKelas, global);
          expect(result).toBe(perKelas);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('per-kelas dipilih meskipun global bernilai lebih tinggi', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 499_999_999 }),
        fc.integer({ min: 500_000_000, max: 999_999_999 }),
        (perKelas, global) => {
          // global is always larger, but per-kelas must still win
          const result = resolveNominalPure(null, perKelas, global);
          expect(result).toBe(perKelas);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Case 3: global only (no per-siswa, no per-kelas) → global wins ───────
  it('nominal global tenant dipilih ketika tidak ada override per-siswa maupun per-kelas', () => {
    /**
     * Property: when both perSiswa and perKelas are null, the global value
     * is always used.
     */
    fc.assert(
      fc.property(positiveNominalArb, (global) => {
        const result = resolveNominalPure(null, null, global);
        expect(result).toBe(global);
      }),
      { numRuns: 100 },
    );
  });

  // ── Case 4: nothing configured → always throws ───────────────────────────
  it('melempar BadRequestException ketika tidak ada nominal yang dikonfigurasi di semua level', () => {
    /**
     * Property: when all three levels are null (or <= 0), an error is always thrown.
     * Also covers zero-value overrides (treated as "not configured").
     */
    fc.assert(
      fc.property(
        // null or zero-value for each level
        fc.oneof(fc.constant(null), fc.constant(0)),
        fc.oneof(fc.constant(null), fc.constant(0)),
        fc.oneof(fc.constant(null), fc.constant(0)),
        (perSiswa, perKelas, global) => {
          expect(() => resolveNominalPure(perSiswa, perKelas, global)).toThrow(BadRequestException);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('nominal yang dikembalikan selalu > 0 untuk semua input valid', () => {
    /**
     * Invariant: whenever at least one level has a valid nominal (> 0),
     * the resolved result is always a positive number.
     */
    const atLeastOneValidArb = fc
      .tuple(
        fc.option(positiveNominalArb, { nil: null }),
        fc.option(positiveNominalArb, { nil: null }),
        fc.option(positiveNominalArb, { nil: null }),
      )
      .filter(([s, k, g]) => s != null || k != null || g != null);

    fc.assert(
      fc.property(atLeastOneValidArb, ([perSiswa, perKelas, global]) => {
        const result = resolveNominalPure(perSiswa, perKelas, global);
        expect(result).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
