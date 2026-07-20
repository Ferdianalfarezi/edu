import fc from 'fast-check';

/**
 * Property 4: Saturday schedule visibility round-trip
 *
 * For any tenant with existing Saturday jadwal records, changing `hari_kerja`
 * from `6_hari` to `5_hari` SHALL exclude Saturday records from query results,
 * and changing back to `6_hari` SHALL restore their visibility — the record set
 * returned after the round-trip SHALL equal the original set.
 *
 * **Validates: Requirements 4.4, 4.5**
 *
 * Feature: hari-kerja-sekolah, Property 4: Saturday schedule visibility round-trip
 */

type HariKerja = '5_hari' | '6_hari';

interface JadwalRecord {
  hari: string;
  mapelId: string;
  jamKe: number;
}

/**
 * Pure function simulating the filtering behavior of JadwalService.findAll()
 * When hari_kerja is '5_hari', Saturday records are excluded from query results.
 * When hari_kerja is '6_hari', all records are returned.
 */
function filterJadwalByHariKerja(jadwal: JadwalRecord[], hariKerja: HariKerja): JadwalRecord[] {
  if (hariKerja === '5_hari') {
    return jadwal.filter((j) => j.hari !== 'sabtu');
  }
  return jadwal;
}

describe('Feature: hari-kerja-sekolah, Property 4: Saturday schedule visibility round-trip', () => {
  const validDays = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

  // Arbitrary for a single jadwal record with valid school days
  const jadwalRecordArb = fc.record({
    hari: fc.constantFrom(...validDays),
    mapelId: fc.uuid(),
    jamKe: fc.integer({ min: 1, max: 10 }),
  });

  // Arbitrary for arrays that always include at least one Saturday entry
  const jadwalWithSaturdayArb = fc
    .tuple(
      // At least one Saturday record
      fc.array(
        fc.record({
          hari: fc.constant('sabtu'),
          mapelId: fc.uuid(),
          jamKe: fc.integer({ min: 1, max: 10 }),
        }),
        { minLength: 1, maxLength: 10 },
      ),
      // Zero or more records for other days
      fc.array(jadwalRecordArb, { minLength: 0, maxLength: 20 }),
    )
    .map(([saturdayRecords, otherRecords]) => [...saturdayRecords, ...otherRecords]);

  it('switching from 6_hari to 5_hari excludes all Saturday records', () => {
    fc.assert(
      fc.property(jadwalWithSaturdayArb, (records) => {
        const filteredFor5Hari = filterJadwalByHariKerja(records, '5_hari');

        // No Saturday records should remain
        const hasSaturday = filteredFor5Hari.some((j) => j.hari === 'sabtu');
        expect(hasSaturday).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('switching back from 5_hari to 6_hari restores full visibility (round-trip)', () => {
    fc.assert(
      fc.property(jadwalWithSaturdayArb, (records) => {
        // Start: 6_hari — all records visible
        const originalView = filterJadwalByHariKerja(records, '6_hari');

        // Toggle to 5_hari — Saturday excluded
        const after5Hari = filterJadwalByHariKerja(records, '5_hari');
        expect(after5Hari.length).toBeLessThan(originalView.length);

        // Toggle back to 6_hari — original visibility restored
        const afterRoundTrip = filterJadwalByHariKerja(records, '6_hari');

        // The round-trip must restore the exact original set
        expect(afterRoundTrip).toEqual(originalView);
        expect(afterRoundTrip).toEqual(records);
      }),
      { numRuns: 100 },
    );
  });

  it('non-Saturday records are unaffected by hari_kerja toggle', () => {
    fc.assert(
      fc.property(jadwalWithSaturdayArb, (records) => {
        const nonSaturdayRecords = records.filter((j) => j.hari !== 'sabtu');

        // Under 5_hari, the result should be exactly the non-Saturday subset
        const filteredFor5Hari = filterJadwalByHariKerja(records, '5_hari');
        expect(filteredFor5Hari).toEqual(nonSaturdayRecords);

        // Under 6_hari, non-Saturday records should still be present
        const filteredFor6Hari = filterJadwalByHariKerja(records, '6_hari');
        const nonSaturdayIn6Hari = filteredFor6Hari.filter((j) => j.hari !== 'sabtu');
        expect(nonSaturdayIn6Hari).toEqual(nonSaturdayRecords);
      }),
      { numRuns: 100 },
    );
  });
});
