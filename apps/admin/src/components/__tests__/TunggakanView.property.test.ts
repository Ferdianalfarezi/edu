// Feature: sistem-pengembangan-v2, Property 12: Fallback sisa frontend — null/undefined/NaN → Math.max(0, ...) selalu >= 0 dan bukan NaN

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Replicate the exact getSisaTagihan logic from TunggakanView.vue.
// The function is a local (non-exported) pure function in that SFC, so we
// copy it verbatim here. Any future change to the original must be
// reflected here.
// ---------------------------------------------------------------------------

interface Tunggakan {
  id?: string;
  siswaId?: string;
  siswaNama?: string;
  kelasNama?: string;
  bulan?: number;
  tahun?: number;
  nominal?: number | null;
  totalDibayar?: number | null;
  sisa?: number | null | undefined;
  status?: string;
  tanggalJatuhTempo?: string | null;
}

/**
 * Exact copy of getSisaTagihan from TunggakanView.vue (Req 7.3).
 * Primary source: server-provided `sisa` if it is a non-NaN number.
 * Fallback: Math.max(0, (nominal ?? 0) - (totalDibayar ?? 0)).
 */
function getSisaTagihan(item: Tunggakan): number {
  if (typeof item.sisa === 'number' && !isNaN(item.sisa)) {
    return item.sisa;
  }
  return Math.max(0, (item.nominal ?? 0) - (item.totalDibayar ?? 0));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for "invalid" sisa values — anything that is NOT a valid number.
 * Covers: null, undefined, NaN, strings, objects, booleans.
 */
const invalidSisaArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(NaN),
  fc.string(),
  fc.boolean(),
);

/**
 * Arbitrary for nominal/totalDibayar — can be any number (including very
 * large, negative, zero) or null/undefined to exercise all fallback paths.
 */
const nominalArb: fc.Arbitrary<number | null | undefined> = fc.oneof(
  fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
  fc.float({ min: -1e9, max: 1e9, noNaN: true }),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(0),
);

// ---------------------------------------------------------------------------
// Property 12: Fallback sisa frontend — null/undefined/NaN → Math.max(0, ...)
//              selalu ≥ 0 dan bukan NaN
// **Validates: Requirements 7.3**
// ---------------------------------------------------------------------------

describe('Property 12: Fallback sisa frontend — null/undefined/NaN → Math.max(0, ...) selalu >= 0 dan bukan NaN', () => {
  // ── 12a: When sisa is null, undefined, or NaN → result is always ≥ 0 and never NaN ──
  it('when sisa is null/undefined/NaN, result is always >= 0 and never NaN', () => {
    fc.assert(
      fc.property(invalidSisaArb, nominalArb, nominalArb, (badSisa, nominal, totalDibayar) => {
        const item = { sisa: badSisa as never, nominal, totalDibayar };
        const result = getSisaTagihan(item);

        // Must not be NaN
        expect(Number.isNaN(result)).toBe(false);
        // Must be >= 0
        expect(result).toBeGreaterThanOrEqual(0);
        // Must be a finite number (not Infinity)
        expect(Number.isFinite(result)).toBe(true);
        // Must not be a string
        expect(typeof result).toBe('number');
      }),
      { numRuns: 200 },
    );
  });

  // ── 12b: When sisa is a valid number, it is returned directly ──
  it('when sisa is a valid number, it is returned directly and is >= 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        nominalArb,
        nominalArb,
        (validSisa, nominal, totalDibayar) => {
          const item = { sisa: validSisa, nominal, totalDibayar };
          const result = getSisaTagihan(item);

          // Server-provided sisa must be returned as-is
          expect(result).toBe(validSisa);
          // And it must be >= 0 (server guarantees non-negative)
          expect(result).toBeGreaterThanOrEqual(0);
          expect(typeof result).toBe('number');
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── 12c: For any combination of nominal and totalDibayar (incl. null/undefined),
  //         result is always >= 0 and never NaN ──
  it('for any nominal and totalDibayar (including null/undefined), result is always >= 0 and never NaN', () => {
    fc.assert(
      fc.property(
        // Force fallback path by always providing an invalid sisa
        fc.constantFrom(null, undefined, NaN),
        nominalArb,
        nominalArb,
        (badSisa, nominal, totalDibayar) => {
          const item = { sisa: badSisa as never, nominal, totalDibayar };
          const result = getSisaTagihan(item);

          expect(Number.isNaN(result)).toBe(false);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(result)).toBe(true);
          expect(typeof result).toBe('number');
        },
      ),
      { numRuns: 200 },
    );
  });

  // ── 12d: Result is never a string, never Infinity ──
  it('result is never a string and never Infinity for any input combination', () => {
    fc.assert(
      fc.property(invalidSisaArb, nominalArb, nominalArb, (badSisa, nominal, totalDibayar) => {
        const item = { sisa: badSisa as never, nominal, totalDibayar };
        const result = getSisaTagihan(item);

        expect(typeof result).toBe('number');
        expect(result).not.toBe(Infinity);
        expect(result).not.toBe(-Infinity);
      }),
      { numRuns: 200 },
    );
  });

  // ── 12e: Edge cases — both nominal and totalDibayar are null/undefined → result is 0 ──
  it('when both nominal and totalDibayar are null/undefined, fallback result is exactly 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, NaN),
        fc.constantFrom(null as null | undefined, undefined as null | undefined),
        fc.constantFrom(null as null | undefined, undefined as null | undefined),
        (badSisa, nominal, totalDibayar) => {
          const item = { sisa: badSisa as never, nominal, totalDibayar };
          const result = getSisaTagihan(item);

          // Math.max(0, (null ?? 0) - (null ?? 0)) = Math.max(0, 0) = 0
          expect(result).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 12f: When totalDibayar > nominal (overpayment), result is clamped to 0 ──
  it('when totalDibayar > nominal (overpayment scenario), fallback result is clamped to 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, NaN),
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        (badSisa, nominal, overpayment) => {
          const totalDibayar = nominal + overpayment; // always > nominal
          const item = { sisa: badSisa as never, nominal, totalDibayar };
          const result = getSisaTagihan(item);

          // Math.max(0, nominal - totalDibayar) must be 0 when totalDibayar > nominal
          expect(result).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
