/**
 * Property 11: New Student Billing Range
 *
 * For any student added to a class in month M of an active tahun ajaran
 * spanning months [start..end], the system SHALL:
 * 1. Generate tagihan only for months [M..end] (Req 9.5)
 * 2. NOT create tagihan for months [start..M-1] (Req 9.7)
 * 3. Use the nominal matching the student's class tingkat configuration (Req 9.6)
 * 4. For any join month within a tahun_ajaran, generate the correct number of future months
 *
 * **Validates: Requirements 9.5, 9.6, 9.7**
 *
 * This is a PURE logic property test — simulate the month range calculation
 * and filtering without DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';

// ─── Pure Logic (mirrors TagihanService implementation) ───────────────────────

/**
 * Calculate all months in a date range (inclusive of both start and end months).
 * Mirrors TagihanService.getMonthsInRange.
 */
function getMonthsInRange(startDate: string, endDate: string): { bulan: number; tahun: number }[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: { bulan: number; tahun: number }[] = [];

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= endMonth) {
    months.push({
      bulan: current.getMonth() + 1, // 1-based
      tahun: current.getFullYear(),
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Filter months to only those from the join month onward (inclusive).
 * Mirrors the futureMonths filter in TagihanService.generateTagihanForNewStudent.
 *
 * "Current month" in the service = the month the student was added.
 */
function filterMonthsFromJoinDate(
  allMonths: { bulan: number; tahun: number }[],
  joinMonth: number,
  joinYear: number,
): { bulan: number; tahun: number }[] {
  return allMonths.filter((m) => {
    if (m.tahun > joinYear) return true;
    if (m.tahun === joinYear && m.bulan >= joinMonth) return true;
    return false;
  });
}

/**
 * Determine nominal for a given tingkat from configuration.
 * Mirrors TagihanService.getNominalFromConfig.
 * Config is a map of tingkat → nominal (e.g. { "1": 200000, "2": 250000 }).
 */
function getNominalFromConfig(config: Record<number, number>, tingkat: number): number {
  return config[tingkat] ?? config[0] ?? 500000; // fallback to default
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

interface TahunAjaranDates {
  tanggalMulai: string;
  tanggalSelesai: string;
}

/**
 * Generates a valid tahun ajaran date range (July → June, ~12 months).
 */
function arbitraryTahunAjaranDates(): fc.Arbitrary<TahunAjaranDates> {
  return fc.integer({ min: 2023, max: 2027 }).map((startYear) => ({
    tanggalMulai: `${startYear}-07-15`,
    tanggalSelesai: `${startYear + 1}-06-14`,
  }));
}

/**
 * Generates a join month/year that falls within a given tahun ajaran range.
 */
function arbitraryJoinMonthInRange(
  ta: TahunAjaranDates,
): fc.Arbitrary<{ bulan: number; tahun: number }> {
  const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
  return fc.constantFrom(...allMonths);
}

/**
 * Generates a class tingkat (grade level).
 */
function arbitraryTingkat(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 12 });
}

/**
 * Generates a nominal SPP config: map of tingkat → nominal in Rupiah.
 * Each tingkat has a nominal between 100k and 2M (in multiples of 50k).
 */
function arbitraryNominalConfig(): fc.Arbitrary<Record<number, number>> {
  return fc
    .array(
      fc.record({
        tingkat: fc.integer({ min: 1, max: 12 }),
        nominal: fc.integer({ min: 2, max: 40 }).map((n) => n * 50000),
      }),
      { minLength: 1, maxLength: 12 },
    )
    .map((entries) => {
      const config: Record<number, number> = {};
      for (const entry of entries) {
        config[entry.tingkat] = entry.nominal;
      }
      // Ensure there's always a default
      config[0] = 500000;
      return config;
    });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 11: New Student Billing Range', () => {
  describe('Tagihan is generated from the current month to end of tahun_ajaran only (Req 9.5)', () => {
    it('generated months start from join month and extend to end of tahun_ajaran', () => {
      fc.assert(
        fc.property(
          arbitraryTahunAjaranDates(),
          fc.integer({ min: 2023, max: 2028 }),
          fc.integer({ min: 1, max: 12 }),
          (ta, joinYear, joinMonth) => {
            const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
            const futureMonths = filterMonthsFromJoinDate(allMonths, joinMonth, joinYear);

            // If join date is within the tahun ajaran period
            const joinIsInRange = allMonths.some(
              (m) => m.bulan === joinMonth && m.tahun === joinYear,
            );

            if (!joinIsInRange) {
              // If join month is after the tahun ajaran, no months should be generated
              // If join month is before the tahun ajaran, all months should be included
              const firstMonth = allMonths[0];
              const lastMonth = allMonths[allMonths.length - 1];

              const joinIsAfterEnd =
                joinYear > lastMonth.tahun ||
                (joinYear === lastMonth.tahun && joinMonth > lastMonth.bulan);

              if (joinIsAfterEnd) {
                // PROPERTY: No tagihan generated when student joins after tahun ajaran
                return futureMonths.length === 0;
              }
              // If join is before the entire range, all months are included
              return futureMonths.length === allMonths.length;
            }

            // PROPERTY: First generated month must be the join month
            if (futureMonths.length === 0) return true; // edge case
            return futureMonths[0].bulan === joinMonth && futureMonths[0].tahun === joinYear;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('the last generated month is always the last month of the tahun_ajaran', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length === 0) return true;

          // Pick a join month that's within the tahun ajaran
          const joinMonth = allMonths[0];
          const futureMonths = filterMonthsFromJoinDate(
            allMonths,
            joinMonth.bulan,
            joinMonth.tahun,
          );

          // PROPERTY: Last generated month equals last month of tahun ajaran
          const lastGenerated = futureMonths[futureMonths.length - 1];
          const lastTA = allMonths[allMonths.length - 1];
          return lastGenerated.bulan === lastTA.bulan && lastGenerated.tahun === lastTA.tahun;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('No tagihan is created for months BEFORE the student joined (Req 9.7)', () => {
    it('no generated month has a date prior to the join month', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length < 2) return true;

          // Pick a random month within the range (not the first)
          return fc.assert(
            fc.property(fc.integer({ min: 1, max: allMonths.length - 1 }), (joinIndex) => {
              const joinMonth = allMonths[joinIndex];
              const futureMonths = filterMonthsFromJoinDate(
                allMonths,
                joinMonth.bulan,
                joinMonth.tahun,
              );

              // PROPERTY: No generated month is before join month
              return futureMonths.every((m) => {
                if (m.tahun > joinMonth.tahun) return true;
                if (m.tahun === joinMonth.tahun) return m.bulan >= joinMonth.bulan;
                return false;
              });
            }),
            { ...PBT_CONFIG, numRuns: 10 }, // inner property, fewer runs
          );
        }),
        { ...PBT_CONFIG, numRuns: 10 }, // outer property
      );
    });

    it('months before join are excluded while months from join onward are included', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length < 2) return true;

          // Pick the middle of the tahun ajaran as join point
          const midIndex = Math.floor(allMonths.length / 2);
          const joinMonth = allMonths[midIndex];
          const futureMonths = filterMonthsFromJoinDate(
            allMonths,
            joinMonth.bulan,
            joinMonth.tahun,
          );

          const expectedBefore = allMonths.slice(0, midIndex);
          const expectedAfter = allMonths.slice(midIndex);

          // PROPERTY: futureMonths === months from joinIndex onward
          if (futureMonths.length !== expectedAfter.length) return false;

          for (let i = 0; i < futureMonths.length; i++) {
            if (
              futureMonths[i].bulan !== expectedAfter[i].bulan ||
              futureMonths[i].tahun !== expectedAfter[i].tahun
            ) {
              return false;
            }
          }

          // PROPERTY: None of the before-join months are in the result
          for (const before of expectedBefore) {
            const found = futureMonths.some(
              (m) => m.bulan === before.bulan && m.tahun === before.tahun,
            );
            if (found) return false;
          }

          return true;
        }),
        PBT_CONFIG,
      );
    });
  });

  describe('The nominal matches the student class tingkat configuration (Req 9.6)', () => {
    it('nominal is determined by tingkat from config, not by any other factor', () => {
      fc.assert(
        fc.property(arbitraryTingkat(), arbitraryNominalConfig(), (tingkat, config) => {
          const nominal = getNominalFromConfig(config, tingkat);

          if (config[tingkat] !== undefined) {
            // PROPERTY: Nominal equals configured value for this tingkat
            return nominal === config[tingkat];
          } else {
            // PROPERTY: Falls back to default when tingkat not configured
            return nominal === config[0];
          }
        }),
        PBT_CONFIG,
      );
    });

    it('all tagihan for a new student have the same nominal (from class tingkat)', () => {
      fc.assert(
        fc.property(
          arbitraryTahunAjaranDates(),
          arbitraryTingkat(),
          arbitraryNominalConfig(),
          (ta, tingkat, config) => {
            const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
            if (allMonths.length === 0) return true;

            const joinMonth = allMonths[0];
            const futureMonths = filterMonthsFromJoinDate(
              allMonths,
              joinMonth.bulan,
              joinMonth.tahun,
            );

            const nominal = getNominalFromConfig(config, tingkat);

            // PROPERTY: All generated tagihan have the same nominal (based on tingkat)
            // Simulating generation — each month gets same nominal
            const tagihanList = futureMonths.map((m) => ({
              bulan: m.bulan,
              tahun: m.tahun,
              nominal,
            }));

            return tagihanList.every((t) => t.nominal === nominal && t.nominal > 0);
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('For any join month within a tahun_ajaran, the correct number of future months is generated', () => {
    it('number of generated months = total months in TA - months before join', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length === 0) return true;

          // Test for every possible join index
          for (let joinIndex = 0; joinIndex < allMonths.length; joinIndex++) {
            const joinMonth = allMonths[joinIndex];
            const futureMonths = filterMonthsFromJoinDate(
              allMonths,
              joinMonth.bulan,
              joinMonth.tahun,
            );

            // PROPERTY: count of future months = total - skipped
            const expectedCount = allMonths.length - joinIndex;
            if (futureMonths.length !== expectedCount) return false;
          }

          return true;
        }),
        PBT_CONFIG,
      );
    });

    it('joining in the first month generates tagihan for all months', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length === 0) return true;

          const firstMonth = allMonths[0];
          const futureMonths = filterMonthsFromJoinDate(
            allMonths,
            firstMonth.bulan,
            firstMonth.tahun,
          );

          // PROPERTY: Joining at start of TA generates tagihan for ALL months
          return futureMonths.length === allMonths.length;
        }),
        PBT_CONFIG,
      );
    });

    it('joining in the last month generates exactly 1 tagihan', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length === 0) return true;

          const lastMonth = allMonths[allMonths.length - 1];
          const futureMonths = filterMonthsFromJoinDate(
            allMonths,
            lastMonth.bulan,
            lastMonth.tahun,
          );

          // PROPERTY: Joining at end of TA generates exactly 1 tagihan
          return futureMonths.length === 1;
        }),
        PBT_CONFIG,
      );
    });

    it('joining after TA ends generates 0 tagihan', () => {
      fc.assert(
        fc.property(arbitraryTahunAjaranDates(), (ta) => {
          const allMonths = getMonthsInRange(ta.tanggalMulai, ta.tanggalSelesai);
          if (allMonths.length === 0) return true;

          const lastMonth = allMonths[allMonths.length - 1];
          // Join one month after the TA ends
          let afterYear = lastMonth.tahun;
          let afterMonth = lastMonth.bulan + 1;
          if (afterMonth > 12) {
            afterMonth = 1;
            afterYear++;
          }

          const futureMonths = filterMonthsFromJoinDate(allMonths, afterMonth, afterYear);

          // PROPERTY: No tagihan when student joins after TA ends
          return futureMonths.length === 0;
        }),
        PBT_CONFIG,
      );
    });
  });
});
