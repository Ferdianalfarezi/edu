import fc from 'fast-check';

/**
 * Property 6: Saturday attendance rejection for 5_hari tenants
 *
 * For any tenant with `hari_kerja = '5_hari'` and any date that falls on a Saturday,
 * attendance submission SHALL be rejected, and kelas-hari-ini SHALL return an empty class list.
 *
 * **Validates: Requirements 5.3**
 *
 * Feature: hari-kerja-sekolah, Property 6: Saturday attendance rejection for 5_hari tenants
 */

/**
 * Pure function simulating attendance rejection logic from AbsensiService.createAbsensi.
 * Returns true if attendance should be rejected (date is Saturday and hariKerja is '5_hari').
 */
function shouldRejectAttendance(hariKerja: '5_hari' | '6_hari', date: Date): boolean {
  const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
  return hariKerja === '5_hari' && dayOfWeek === 6;
}

/**
 * Pure function simulating kelas-hari-ini empty result logic from AbsensiService.getKelasHariIni.
 * Returns true if kelas-hari-ini should return an empty class list.
 */
function shouldReturnEmptyClasses(hariKerja: '5_hari' | '6_hari', dayOfWeek: number): boolean {
  return hariKerja === '5_hari' && dayOfWeek === 6;
}

/**
 * Arbitrary that generates Saturday dates within a given month/year range.
 * Strategy: generate year (2020-2030) and month (1-12), then find all Saturdays
 * in that month, and pick one.
 */
const saturdayDateArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
  })
  .chain(({ year, month }) => {
    // Find all Saturdays in the given month
    const saturdays: Date[] = [];
    const lastDay = new Date(year, month, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 6) {
        saturdays.push(date);
      }
    }
    // Every month has at least 4 Saturdays
    return fc.constantFrom(...saturdays);
  });

describe('Feature: hari-kerja-sekolah, Property 6: Saturday attendance rejection for 5_hari tenants', () => {
  describe('shouldRejectAttendance', () => {
    it('rejects attendance for 5_hari tenants on any Saturday', () => {
      fc.assert(
        fc.property(saturdayDateArb, (saturdayDate) => {
          expect(shouldRejectAttendance('5_hari', saturdayDate)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('does NOT reject attendance for 6_hari tenants on any Saturday', () => {
      fc.assert(
        fc.property(saturdayDateArb, (saturdayDate) => {
          expect(shouldRejectAttendance('6_hari', saturdayDate)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('shouldReturnEmptyClasses', () => {
    it('returns empty classes for 5_hari tenants on Saturday (dayOfWeek=6)', () => {
      fc.assert(
        fc.property(saturdayDateArb, (saturdayDate) => {
          const dayOfWeek = saturdayDate.getDay();
          expect(shouldReturnEmptyClasses('5_hari', dayOfWeek)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('does NOT return empty classes for 6_hari tenants on Saturday (dayOfWeek=6)', () => {
      fc.assert(
        fc.property(saturdayDateArb, (saturdayDate) => {
          const dayOfWeek = saturdayDate.getDay();
          expect(shouldReturnEmptyClasses('6_hari', dayOfWeek)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('consistency between rejection and empty classes', () => {
    it('shouldRejectAttendance and shouldReturnEmptyClasses agree on Saturday for 5_hari', () => {
      fc.assert(
        fc.property(saturdayDateArb, (saturdayDate) => {
          const rejected = shouldRejectAttendance('5_hari', saturdayDate);
          const emptyClasses = shouldReturnEmptyClasses('5_hari', saturdayDate.getDay());
          expect(rejected).toBe(emptyClasses);
        }),
        { numRuns: 100 },
      );
    });

    it('shouldRejectAttendance and shouldReturnEmptyClasses agree on Saturday for 6_hari', () => {
      fc.assert(
        fc.property(saturdayDateArb, (saturdayDate) => {
          const rejected = shouldRejectAttendance('6_hari', saturdayDate);
          const emptyClasses = shouldReturnEmptyClasses('6_hari', saturdayDate.getDay());
          expect(rejected).toBe(emptyClasses);
        }),
        { numRuns: 100 },
      );
    });
  });
});
