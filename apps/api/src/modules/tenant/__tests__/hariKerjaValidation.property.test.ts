import fc from 'fast-check';

/**
 * Property 1: Hari kerja validation accepts only valid values
 *
 * For any string value, the hari_kerja validation function SHALL accept the value
 * if and only if it equals '5_hari' or '6_hari'; all other strings SHALL be rejected.
 *
 * **Validates: Requirements 1.1, 1.4, 3.5**
 */

/** The allowed values array used by @IsIn in CreateTenantDto and UpdateHariKerjaDto */
const ALLOWED_HARI_KERJA = ['5_hari', '6_hari'] as const;

/**
 * Pure validation function that mirrors the @IsIn(['5_hari', '6_hari']) decorator behavior.
 * Returns true if the value is in the allowed set, false otherwise.
 */
function isValidHariKerja(value: string): boolean {
  return (ALLOWED_HARI_KERJA as readonly string[]).includes(value);
}

describe('Feature: hari-kerja-sekolah, Property 1: Hari kerja validation accepts only valid values', () => {
  it('only "5_hari" and "6_hari" are accepted as valid hari_kerja values', () => {
    fc.assert(
      fc.property(fc.string(), (arbitraryValue) => {
        const isValid = isValidHariKerja(arbitraryValue);

        if (arbitraryValue === '5_hari' || arbitraryValue === '6_hari') {
          expect(isValid).toBe(true);
        } else {
          expect(isValid).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('"5_hari" always passes validation', () => {
    expect(isValidHariKerja('5_hari')).toBe(true);
  });

  it('"6_hari" always passes validation', () => {
    expect(isValidHariKerja('6_hari')).toBe(true);
  });

  it('similar but incorrect strings are rejected', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('5_Hari'),
          fc.constant('6_Hari'),
          fc.constant('5hari'),
          fc.constant('6hari'),
          fc.constant('5 hari'),
          fc.constant('6 hari'),
          fc.constant('7_hari'),
          fc.constant('0_hari'),
          fc.constant('hari_5'),
          fc.constant('hari_6'),
          fc.constant(''),
          fc.constant(' '),
          fc.constant('5_hari '),
          fc.constant(' 6_hari'),
        ),
        (invalidValue) => {
          expect(isValidHariKerja(invalidValue)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the allowed set contains exactly 2 values', () => {
    expect(ALLOWED_HARI_KERJA).toHaveLength(2);
    expect(ALLOWED_HARI_KERJA).toContain('5_hari');
    expect(ALLOWED_HARI_KERJA).toContain('6_hari');
  });
});
