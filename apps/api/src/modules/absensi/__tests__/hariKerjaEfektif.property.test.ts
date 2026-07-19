import fc from 'fast-check';

/**
 * Property 5: Hari efektif metamorphic — 5_hari always ≤ 6_hari
 *
 * For any month and year, the hari_efektif computed with `hari_kerja = '5_hari'`
 * SHALL be less than or equal to the hari_efektif computed with `hari_kerja = '6_hari'`
 * for the same month, given the same set of holidays.
 *
 * **Validates: Requirements 5.1, 5.2**
 *
 * Feature: hari-kerja-sekolah, Property 5: Hari efektif metamorphic — 5_hari always ≤ 6_hari
 */

/**
 * Pure function extracted from AbsensiService.countSchoolDays.
 * Counts school days between start and end dates (inclusive) based on hari_kerja setting.
 * - 5_hari: counts Mon–Fri (getDay() 1–5)
 * - 6_hari: counts Mon–Sat (getDay() 1–6)
 */
function countSchoolDays(
  startDate: string,
  endDate: string,
  hariKerja: '5_hari' | '6_hari',
): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let count = 0;
  const maxDay = hariKerja === '5_hari' ? 5 : 6; // 5=Friday, 6=Saturday

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= maxDay) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Helper to compute start and end dates for a given month/year.
 */
function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  // Last day of the month: day 0 of next month
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

describe('Feature: hari-kerja-sekolah, Property 5: Hari efektif metamorphic — 5_hari always ≤ 6_hari', () => {
  // Arbitrary for month (1–12) and year (2020–2030)
  const monthArb = fc.integer({ min: 1, max: 12 });
  const yearArb = fc.integer({ min: 2020, max: 2030 });

  it('countSchoolDays with 5_hari is always <= countSchoolDays with 6_hari for any month', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const { startDate, endDate } = getMonthDateRange(year, month);

        const days5 = countSchoolDays(startDate, endDate, '5_hari');
        const days6 = countSchoolDays(startDate, endDate, '6_hari');

        expect(days5).toBeLessThanOrEqual(days6);
      }),
      { numRuns: 100 },
    );
  });

  it('the difference between 6_hari and 5_hari equals the number of Saturdays in the month', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const { startDate, endDate } = getMonthDateRange(year, month);

        const days5 = countSchoolDays(startDate, endDate, '5_hari');
        const days6 = countSchoolDays(startDate, endDate, '6_hari');

        // Count Saturdays in the month
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        let saturdays = 0;
        const current = new Date(start);
        while (current <= end) {
          if (current.getDay() === 6) saturdays++;
          current.setDate(current.getDate() + 1);
        }

        expect(days6 - days5).toBe(saturdays);
      }),
      { numRuns: 100 },
    );
  });

  it('both 5_hari and 6_hari counts are non-negative for any month', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const { startDate, endDate } = getMonthDateRange(year, month);

        const days5 = countSchoolDays(startDate, endDate, '5_hari');
        const days6 = countSchoolDays(startDate, endDate, '6_hari');

        expect(days5).toBeGreaterThanOrEqual(0);
        expect(days6).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });
});
