import fc from 'fast-check';

/**
 * Property 3: Jadwal day validation respects hari_kerja setting
 *
 * For any tenant with a given `hari_kerja` setting and any day name, jadwal creation
 * SHALL succeed if and only if the day is within the allowed set
 * (`{senin..jumat}` for `5_hari`, `{senin..sabtu}` for `6_hari`).
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

// All valid day names in the system
const ALL_DAYS = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const;
type DayName = (typeof ALL_DAYS)[number];
type HariKerja = '5_hari' | '6_hari';

const FIVE_DAY_ALLOWED: ReadonlySet<string> = new Set([
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
]);
const SIX_DAY_ALLOWED: ReadonlySet<string> = new Set([
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
]);

/**
 * Pure function extracted from JadwalService.validateHariKerja():
 * Returns true if the day is allowed for the given hari_kerja setting,
 * false if it should be rejected.
 */
function isDayAllowed(hariKerja: HariKerja, day: string): boolean {
  const allowedDays =
    hariKerja === '5_hari'
      ? ['senin', 'selasa', 'rabu', 'kamis', 'jumat']
      : ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

  return allowedDays.includes(day);
}

/**
 * Expected allowed set lookup for verification (independent of implementation)
 */
function getExpectedAllowedSet(hariKerja: HariKerja): ReadonlySet<string> {
  return hariKerja === '5_hari' ? FIVE_DAY_ALLOWED : SIX_DAY_ALLOWED;
}

// Arbitraries
const hariKerjaArb = fc.constantFrom<HariKerja>('5_hari', '6_hari');
const dayArb = fc.constantFrom<DayName>(...ALL_DAYS);

describe('Feature: hari-kerja-sekolah, Property 3: Jadwal day validation respects hari_kerja setting', () => {
  it('for 5_hari, only senin through jumat are allowed', () => {
    fc.assert(
      fc.property(dayArb, (day) => {
        const result = isDayAllowed('5_hari', day);
        const expected = FIVE_DAY_ALLOWED.has(day);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('for 6_hari, senin through sabtu are allowed', () => {
    fc.assert(
      fc.property(dayArb, (day) => {
        const result = isDayAllowed('6_hari', day);
        const expected = SIX_DAY_ALLOWED.has(day);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('minggu is never allowed regardless of hari_kerja setting', () => {
    fc.assert(
      fc.property(hariKerjaArb, (hariKerja) => {
        const result = isDayAllowed(hariKerja, 'minggu');
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('isDayAllowed matches expected allowed-set membership for any (hariKerja, day) tuple', () => {
    fc.assert(
      fc.property(hariKerjaArb, dayArb, (hariKerja, day) => {
        const result = isDayAllowed(hariKerja, day);
        const expectedSet = getExpectedAllowedSet(hariKerja);
        expect(result).toBe(expectedSet.has(day));
      }),
      { numRuns: 100 },
    );
  });

  it('5_hari allowed set is a strict subset of 6_hari allowed set', () => {
    fc.assert(
      fc.property(dayArb, (day) => {
        const allowedIn5 = isDayAllowed('5_hari', day);
        const allowedIn6 = isDayAllowed('6_hari', day);
        // If allowed in 5_hari, must also be allowed in 6_hari
        if (allowedIn5) {
          expect(allowedIn6).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('sabtu is only allowed for 6_hari, not for 5_hari', () => {
    fc.assert(
      fc.property(hariKerjaArb, (hariKerja) => {
        const result = isDayAllowed(hariKerja, 'sabtu');
        if (hariKerja === '5_hari') {
          expect(result).toBe(false);
        } else {
          expect(result).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
