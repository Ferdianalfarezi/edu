import fc from 'fast-check';

/**
 * Property 7: Saturday attendance records excluded from calculations after switch
 *
 * For any tenant that switches from `6_hari` to `5_hari` and has existing Saturday
 * attendance records, those records SHALL still exist in the database but SHALL be
 * excluded from rekap percentage calculations.
 *
 * **Validates: Requirements 5.5**
 *
 * Feature: hari-kerja-sekolah, Property 7: Saturday attendance records excluded from calculations after switch
 */

interface AttendanceRecord {
  tanggal: string; // date string YYYY-MM-DD
  status: 'hadir' | 'izin' | 'sakit' | 'alpa';
}

/**
 * Pure function that simulates rekap calculation filtering.
 * When hariKerja is '5_hari', Saturday records are excluded from the result.
 * When hariKerja is '6_hari', all records are included.
 */
function filterRecordsForRekap(
  records: AttendanceRecord[],
  hariKerja: '5_hari' | '6_hari',
): AttendanceRecord[] {
  if (hariKerja === '5_hari') {
    return records.filter((r) => new Date(r.tanggal + 'T00:00:00').getDay() !== 6);
  }
  return records;
}

/**
 * Helper: check if a date string falls on a Saturday
 */
function isSaturday(tanggal: string): boolean {
  return new Date(tanggal + 'T00:00:00').getDay() === 6;
}

// --- Arbitraries ---

const statusArb = fc.constantFrom<'hadir' | 'izin' | 'sakit' | 'alpa'>(
  'hadir',
  'izin',
  'sakit',
  'alpa',
);

/**
 * Generate a date string guaranteed to fall on a Saturday.
 * Strategy: pick a base Saturday and offset by weeks.
 */
const saturdayDateArb = fc.integer({ min: 0, max: 200 }).map((weekOffset) => {
  // 2024-01-06 is a Saturday
  const base = new Date('2024-01-06T00:00:00');
  base.setDate(base.getDate() + weekOffset * 7);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
});

/**
 * Generate a date string guaranteed to NOT fall on a Saturday (Mon–Fri).
 * Strategy: pick a base Monday and offset by 0–4 days within the week, then offset by weeks.
 */
const weekdayDateArb = fc
  .tuple(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 4 }))
  .map(([weekOffset, dayOffset]) => {
    // 2024-01-01 is a Monday
    const base = new Date('2024-01-01T00:00:00');
    base.setDate(base.getDate() + weekOffset * 7 + dayOffset);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

const saturdayRecordArb: fc.Arbitrary<AttendanceRecord> = fc
  .tuple(saturdayDateArb, statusArb)
  .map(([tanggal, status]) => ({ tanggal, status }));

const weekdayRecordArb: fc.Arbitrary<AttendanceRecord> = fc
  .tuple(weekdayDateArb, statusArb)
  .map(([tanggal, status]) => ({ tanggal, status }));

/**
 * Generate a mixed array of attendance records that includes at least one Saturday record.
 */
const mixedRecordsArb: fc.Arbitrary<AttendanceRecord[]> = fc
  .tuple(
    fc.array(saturdayRecordArb, { minLength: 1, maxLength: 10 }),
    fc.array(weekdayRecordArb, { minLength: 0, maxLength: 15 }),
  )
  .map(([satRecords, wdRecords]) => [...satRecords, ...wdRecords])
  .chain((records) =>
    fc.shuffledSubarray(records, { minLength: records.length, maxLength: records.length }),
  );

describe('Feature: hari-kerja-sekolah, Property 7: Saturday attendance records excluded from calculations after switch', () => {
  it('under 5_hari, Saturday records are excluded from filtered results', () => {
    fc.assert(
      fc.property(mixedRecordsArb, (records) => {
        const filtered = filterRecordsForRekap(records, '5_hari');

        // No Saturday records in filtered output
        for (const r of filtered) {
          expect(isSaturday(r.tanggal)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('under 6_hari, all records are included', () => {
    fc.assert(
      fc.property(mixedRecordsArb, (records) => {
        const filtered = filterRecordsForRekap(records, '6_hari');

        expect(filtered).toHaveLength(records.length);
        expect(filtered).toEqual(records);
      }),
      { numRuns: 100 },
    );
  });

  it('the original array is unchanged after filtering (records remain in "DB")', () => {
    fc.assert(
      fc.property(mixedRecordsArb, (records) => {
        // Deep copy to compare after filtering
        const originalCopy = records.map((r) => ({ ...r }));

        // Perform filtering for both modes
        filterRecordsForRekap(records, '5_hari');
        filterRecordsForRekap(records, '6_hari');

        // Original array is not mutated
        expect(records).toHaveLength(originalCopy.length);
        for (let i = 0; i < records.length; i++) {
          expect(records[i].tanggal).toBe(originalCopy[i].tanggal);
          expect(records[i].status).toBe(originalCopy[i].status);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('filtered count for 5_hari is always <= count for 6_hari', () => {
    fc.assert(
      fc.property(mixedRecordsArb, (records) => {
        const filtered5 = filterRecordsForRekap(records, '5_hari');
        const filtered6 = filterRecordsForRekap(records, '6_hari');

        expect(filtered5.length).toBeLessThanOrEqual(filtered6.length);
      }),
      { numRuns: 100 },
    );
  });
});
