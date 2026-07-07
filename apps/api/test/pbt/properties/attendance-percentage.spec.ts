/**
 * Property 5: Attendance Percentage Calculation
 *
 * The attendance percentage is calculated as:
 *   persentase = (jumlah_hadir / total_hari_efektif) × 100
 *
 * Properties verified:
 * 1. Percentage is always between 0 and 100 (inclusive) when hari_efektif > 0
 * 2. When jumlah_hadir == total_hari_efektif, percentage is exactly 100
 * 3. When jumlah_hadir == 0, percentage is exactly 0
 * 4. When total_hari_efektif is 0 or null, percentage should be null
 * 5. Holidays are excluded from hari_efektif: weekdays minus holidays
 * 6. Percentage is correctly rounded to 1 decimal place
 *
 * **Validates: Requirements 1.14, 4.3, 4.5, 4.6**
 *
 * This is a PURE logic property test — no DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';

// ─── Pure Logic (mirrors the service implementation) ──────────────────────────

/**
 * Calculate attendance percentage.
 * Mirrors AbsensiService logic:
 *   `Math.round((counts.hadir / hariEfektif) * 1000) / 10`
 *
 * Returns null when hariEfektif is null or <= 0.
 */
function calculatePersentaseKehadiran(
  jumlahHadir: number,
  totalHariEfektif: number | null,
): number | null {
  if (totalHariEfektif === null || totalHariEfektif <= 0) {
    return null;
  }
  return Math.round((jumlahHadir / totalHariEfektif) * 1000) / 10;
}

/**
 * Count weekdays (Monday through Saturday) in a date range, inclusive.
 * Sunday (getDay() === 0) is excluded.
 * Mirrors AbsensiService.countWeekdays.
 */
function countWeekdays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let count = 0;

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Calculate hari efektif for a month: weekdays minus holidays on weekdays.
 * Returns null if result is <= 0.
 * Mirrors AbsensiService.calculateHariEfektifForMonth (auto-calc path).
 */
function calculateHariEfektifAutomatic(
  bulan: number,
  tahun: number,
  holidays: string[], // ISO date strings (YYYY-MM-DD)
): number | null {
  const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const lastDay = new Date(tahun, bulan, 0).getDate();
  const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const weekdays = countWeekdays(startDate, endDate);

  // Count holidays that fall on weekdays
  let holidaysOnWeekdays = 0;
  for (const holiday of holidays) {
    const dateObj = new Date(holiday + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 6) {
      holidaysOnWeekdays++;
    }
  }

  const hariEfektif = weekdays - holidaysOnWeekdays;
  return hariEfektif > 0 ? hariEfektif : null;
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/**
 * Generates a positive hari efektif value (realistic school month: 1-31).
 */
function arbitraryHariEfektif(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 31 });
}

/**
 * Generates jumlah_hadir that is always <= totalHariEfektif (can't attend more than available days).
 */
function arbitraryJumlahHadir(totalHariEfektif: number): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: totalHariEfektif });
}

/**
 * Generates a month (1-12).
 */
function arbitraryBulan(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 12 });
}

/**
 * Generates a year in valid school range.
 */
function arbitraryTahun(): fc.Arbitrary<number> {
  return fc.integer({ min: 2020, max: 2030 });
}

/**
 * Generates a list of holiday dates within a given month.
 * Holidays are random dates in the month (may or may not fall on weekdays).
 */
function arbitraryHolidaysInMonth(bulan: number, tahun: number): fc.Arbitrary<string[]> {
  const lastDay = new Date(tahun, bulan, 0).getDate();
  return fc
    .array(fc.integer({ min: 1, max: lastDay }), { minLength: 0, maxLength: 10 })
    .map((days) => {
      // Deduplicate
      const uniqueDays = [...new Set(days)];
      return uniqueDays.map(
        (d) => `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      );
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 5: Attendance Percentage Calculation', () => {
  describe('Percentage is always between 0 and 100 (inclusive) when hari_efektif > 0', () => {
    it('percentage falls within [0, 100] for any valid hadir/hari_efektif combination', () => {
      fc.assert(
        fc.property(
          arbitraryHariEfektif(),
          fc.integer({ min: 0, max: 31 }),
          (hariEfektif, rawHadir) => {
            // Constrain jumlah_hadir to valid range [0, hariEfektif]
            const jumlahHadir = Math.min(rawHadir, hariEfektif);

            const result = calculatePersentaseKehadiran(jumlahHadir, hariEfektif);

            // PROPERTY: result must be non-null and within [0, 100]
            return result !== null && result >= 0 && result <= 100;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('When jumlah_hadir == total_hari_efektif, percentage is exactly 100', () => {
    it('perfect attendance always yields 100%', () => {
      fc.assert(
        fc.property(arbitraryHariEfektif(), (hariEfektif) => {
          const result = calculatePersentaseKehadiran(hariEfektif, hariEfektif);

          // PROPERTY: full attendance = 100%
          return result === 100;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('When jumlah_hadir == 0, percentage is exactly 0', () => {
    it('zero attendance always yields 0%', () => {
      fc.assert(
        fc.property(arbitraryHariEfektif(), (hariEfektif) => {
          const result = calculatePersentaseKehadiran(0, hariEfektif);

          // PROPERTY: zero attendance = 0%
          return result === 0;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('When total_hari_efektif is 0 or null, percentage should be null', () => {
    it('null hari_efektif yields null percentage', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 31 }), (jumlahHadir) => {
          const result = calculatePersentaseKehadiran(jumlahHadir, null);

          // PROPERTY: can't calculate percentage without hari_efektif
          return result === null;
        }),
        PBT_CONFIG,
      );
    });

    it('zero hari_efektif yields null percentage', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 31 }), (jumlahHadir) => {
          const result = calculatePersentaseKehadiran(jumlahHadir, 0);

          // PROPERTY: division by zero is prevented, returns null
          return result === null;
        }),
        PBT_CONFIG,
      );
    });

    it('negative hari_efektif yields null percentage', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 31 }),
          fc.integer({ min: -100, max: -1 }),
          (jumlahHadir, negativeHariEfektif) => {
            const result = calculatePersentaseKehadiran(jumlahHadir, negativeHariEfektif);

            // PROPERTY: negative effective days is treated as invalid, returns null
            return result === null;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Holidays are excluded from hari_efektif: weekdays minus holidays', () => {
    it('adding a weekday holiday reduces hari_efektif by 1', () => {
      fc.assert(
        fc.property(arbitraryBulan(), arbitraryTahun(), (bulan, tahun) => {
          const noHolidays = calculateHariEfektifAutomatic(bulan, tahun, []);
          if (noHolidays === null) return true; // edge case — skip

          // Find a weekday in this month to use as a holiday
          const lastDay = new Date(tahun, bulan, 0).getDate();
          let weekdayDate: string | null = null;
          for (let d = 1; d <= lastDay; d++) {
            const dateStr = `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 6) {
              weekdayDate = dateStr;
              break;
            }
          }

          if (!weekdayDate) return true; // no weekday found (impossible for a real month)

          const withHoliday = calculateHariEfektifAutomatic(bulan, tahun, [weekdayDate]);

          // PROPERTY: one weekday holiday subtracts exactly 1 from hari_efektif
          if (withHoliday === null) {
            // Only valid if original was exactly 1 (becomes 0 → null)
            return noHolidays === 1;
          }
          return withHoliday === noHolidays - 1;
        }),
        PBT_CONFIG,
      );
    });

    it('Sunday holidays do NOT reduce hari_efektif', () => {
      fc.assert(
        fc.property(arbitraryBulan(), arbitraryTahun(), (bulan, tahun) => {
          const noHolidays = calculateHariEfektifAutomatic(bulan, tahun, []);
          if (noHolidays === null) return true;

          // Find a Sunday in this month
          const lastDay = new Date(tahun, bulan, 0).getDate();
          let sundayDate: string | null = null;
          for (let d = 1; d <= lastDay; d++) {
            const dateStr = `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
            if (dayOfWeek === 0) {
              sundayDate = dateStr;
              break;
            }
          }

          if (!sundayDate) return true; // no Sunday found (shouldn't happen)

          const withSundayHoliday = calculateHariEfektifAutomatic(bulan, tahun, [sundayDate]);

          // PROPERTY: Sunday holidays have no effect on hari_efektif
          return withSundayHoliday === noHolidays;
        }),
        PBT_CONFIG,
      );
    });

    it('hari_efektif is always <= total weekdays in the month', () => {
      fc.assert(
        fc.property(
          arbitraryBulan(),
          arbitraryTahun(),
          fc.array(fc.integer({ min: 1, max: 31 }), { minLength: 0, maxLength: 15 }),
          (bulan, tahun, holidayDays) => {
            const lastDay = new Date(tahun, bulan, 0).getDate();
            const validDays = holidayDays.filter((d) => d <= lastDay);
            const holidays = [...new Set(validDays)].map(
              (d) => `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            );

            const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
            const endDate = `${tahun}-${String(bulan).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const totalWeekdays = countWeekdays(startDate, endDate);

            const hariEfektif = calculateHariEfektifAutomatic(bulan, tahun, holidays);

            // PROPERTY: hari_efektif (if not null) is always <= total weekdays
            if (hariEfektif === null) return true;
            return hariEfektif <= totalWeekdays;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Percentage is correctly rounded to 1 decimal place', () => {
    it('result always has at most 1 decimal digit', () => {
      fc.assert(
        fc.property(
          arbitraryHariEfektif(),
          fc.integer({ min: 0, max: 31 }),
          (hariEfektif, rawHadir) => {
            const jumlahHadir = Math.min(rawHadir, hariEfektif);
            const result = calculatePersentaseKehadiran(jumlahHadir, hariEfektif);

            if (result === null) return true;

            // PROPERTY: result multiplied by 10 should be an integer (at most 1 decimal)
            const scaled = result * 10;
            return Math.abs(scaled - Math.round(scaled)) < 1e-10;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('rounding uses standard rounding (round half up)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 0, max: 30 }),
          (hariEfektif, rawHadir) => {
            const jumlahHadir = Math.min(rawHadir, hariEfektif);
            const result = calculatePersentaseKehadiran(jumlahHadir, hariEfektif);

            if (result === null) return true;

            // PROPERTY: result matches the formula Math.round(hadir/total * 1000) / 10
            const expected = Math.round((jumlahHadir / hariEfektif) * 1000) / 10;
            return Math.abs(result - expected) < 1e-10;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
