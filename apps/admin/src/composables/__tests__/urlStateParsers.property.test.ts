import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parsePage, parseEnumFilter } from '../urlStateParsers';

/**
 * Property 4: Invalid Page Values Fall Back to 1
 *
 * For any string value that is non-numeric, zero, or negative when parsed
 * as an integer, parsePage must return 1. For valid positive integers,
 * parsePage must return the parsed value.
 *
 * **Validates: Requirements 2.7, 7.1**
 */
describe('Property 4: Invalid Page Values Fall Back to 1', () => {
  it('for any arbitrary string that is NOT a valid positive integer string, parsePage returns 1', () => {
    const nonPositiveIntegerString = fc.string().filter((s) => {
      const parsed = parseInt(s, 10);
      return isNaN(parsed) || parsed < 1;
    });

    fc.assert(
      fc.property(nonPositiveIntegerString, (s) => {
        expect(parsePage(s)).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('for any positive integer n >= 1, parsePage(String(n)) returns n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (n) => {
        expect(parsePage(String(n))).toBe(n);
      }),
      { numRuns: 100 },
    );
  });

  it('for any non-positive integer (zero or negative), parsePage returns 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2_147_483_648, max: 0 }), (n) => {
        expect(parsePage(String(n))).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('for any array value, parsePage uses the first element', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), (arr) => {
        const result = parsePage(arr);
        // The result should be the same as parsing just the first element
        expect(result).toBe(parsePage(arr[0]));
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 6: Invalid Enum Values Fall Back to Undefined
 *
 * For any filter configured with type 'enum' and a defined enumValues array,
 * and for any string value not present in that array, the parsed filter value
 * must be undefined. For any value present in the array, the parsed filter value
 * must be that value.
 *
 * **Validates: Requirements 3.5, 4.5, 6.5**
 */
describe('Property 6: Invalid Enum Values Fall Back to Undefined', () => {
  const enumValues = ['aktif', 'pindah_sekolah', 'keluar', 'alumni'];

  it('returns undefined for any string NOT in the enumValues array', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !enumValues.includes(s) && s !== ''),
        (invalidValue) => {
          const result = parseEnumFilter(invalidValue, enumValues);
          expect(result).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns the value for any string chosen FROM the enumValues array', () => {
    fc.assert(
      fc.property(fc.constantFrom(...enumValues), (validValue) => {
        const result = parseEnumFilter(validValue, enumValues);
        expect(result).toBe(validValue);
      }),
      { numRuns: 100 },
    );
  });

  it('returns undefined for undefined or empty string input regardless of enumValues', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, ''),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 }),
        (input, randomEnumValues) => {
          const result = parseEnumFilter(input, randomEnumValues);
          expect(result).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
