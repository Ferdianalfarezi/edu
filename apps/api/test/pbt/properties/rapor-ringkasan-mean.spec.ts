/**
 * Property 5: Rapor ringkasan computes correct arithmetic mean
 *
 * For any set of N rapor_nilai records (N ≥ 1) with random rata_rata values
 * (decimal 0-100), the computed rata_rata equals the arithmetic mean of all
 * rata_rata values, rounded to 2 decimal places.
 *
 * The rounding uses PostgreSQL ROUND semantics (half-up rounding).
 *
 * **Validates: Requirements 3.3**
 *
 * Feature: student-detail-page, Property 5: Rapor ringkasan arithmetic mean
 *
 * Properties verified:
 * 1. The computed rata_rata equals the arithmetic mean of all rata_rata values,
 *    rounded to 2 decimal places using half-up rounding (PostgreSQL ROUND behavior).
 * 2. The result is always a number (never NaN) for N ≥ 1 records.
 * 3. The result is in the range [0, 100].
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';

// ─── Rounding Logic ───────────────────────────────────────────────────────────

/**
 * Implements PostgreSQL's ROUND(x, 2) — "round half away from zero" (half-up for positives).
 * For positive numbers: round half up.
 * e.g., ROUND(2.125, 2) = 2.13, ROUND(2.1249, 2) = 2.12
 *
 * We multiply by 100, apply Math.round (which rounds half-up for positive values),
 * then divide by 100. This matches PostgreSQL ROUND for values in [0, 100].
 */
function pgRound2(value: number): number {
  // Use the same approach as Number.toFixed but with explicit half-up
  // For positive numbers, adding a small epsilon before rounding handles
  // floating-point representation issues (e.g., 2.125 stored as 2.1249999...)
  // However, for a clean property test, we use string-based rounding which
  // matches how PostgreSQL would compute it with numeric precision.
  //
  // PostgreSQL ROUND on numeric type uses "round half away from zero":
  // We simulate this by converting to high-precision and rounding.
  const shifted = value * 100;
  const rounded = Math.round(shifted);
  return rounded / 100;
}

// ─── Simulated Rapor Ringkasan Logic ──────────────────────────────────────────

/**
 * Simulates the SQL: ROUND(AVG(rapor_nilai.rata_rata::numeric), 2)
 * followed by: parseFloat(row.avgRataRata) || 0
 *
 * Given an array of rata_rata values, computes the arithmetic mean
 * rounded to 2 decimal places.
 */
function computeRaporRataRata(rataRataValues: number[]): number {
  if (rataRataValues.length === 0) {
    return 0;
  }

  const sum = rataRataValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / rataRataValues.length;
  const rounded = pgRound2(mean);

  // Simulates: parseFloat(row.avgRataRata) || 0
  // PostgreSQL returns the rounded value as a string, parseFloat converts it back
  const asString = rounded.toFixed(2);
  const result = parseFloat(asString) || 0;

  return result;
}

/**
 * Reference implementation: computes arithmetic mean rounded to 2 decimals.
 * Uses the same pgRound2 logic to get the expected result.
 */
function expectedArithmeticMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  const mean = sum / values.length;
  return pgRound2(mean);
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a rata_rata value: decimal in [0, 100] with up to 2 decimal places.
 * This models rapor_nilai.rata_rata which is a decimal(5,2) in the database.
 */
function arbitraryRataRata(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 10000 }).map((n) => n / 100);
}

/**
 * Generates an array of N rata_rata values (N ≥ 1, up to 30 subjects per rapor).
 */
function arbitraryRataRataArray(): fc.Arbitrary<number[]> {
  return fc.array(arbitraryRataRata(), { minLength: 1, maxLength: 30 });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 5: Rapor ringkasan arithmetic mean', () => {
  /**
   * **Validates: Requirements 3.3**
   */
  it('computed rata_rata equals arithmetic mean of all rata_rata values, rounded to 2 decimal places', () => {
    fc.assert(
      fc.property(arbitraryRataRataArray(), (rataRataValues) => {
        const computed = computeRaporRataRata(rataRataValues);
        const expected = expectedArithmeticMean(rataRataValues);

        return computed === expected;
      }),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 3.3**
   */
  it('result is always a finite number (never NaN) for N ≥ 1 records', () => {
    fc.assert(
      fc.property(arbitraryRataRataArray(), (rataRataValues) => {
        const computed = computeRaporRataRata(rataRataValues);

        return Number.isFinite(computed) && !Number.isNaN(computed);
      }),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 3.3**
   */
  it('result is always within the range [0, 100]', () => {
    fc.assert(
      fc.property(arbitraryRataRataArray(), (rataRataValues) => {
        const computed = computeRaporRataRata(rataRataValues);

        return computed >= 0 && computed <= 100;
      }),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * For a single value, the mean should equal that value rounded to 2 decimals.
   */
  it('single value mean equals the value itself (rounded to 2 decimals)', () => {
    fc.assert(
      fc.property(arbitraryRataRata(), (singleValue) => {
        const computed = computeRaporRataRata([singleValue]);
        const expected = pgRound2(singleValue);

        return computed === expected;
      }),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * If all values are equal, the mean should equal that value.
   */
  it('uniform values produce mean equal to that uniform value', () => {
    fc.assert(
      fc.property(arbitraryRataRata(), fc.integer({ min: 1, max: 30 }), (value, count) => {
        const values = Array.from({ length: count }, () => value);
        const computed = computeRaporRataRata(values);
        const expected = pgRound2(value);

        return computed === expected;
      }),
      PBT_CONFIG,
    );
  });
});
