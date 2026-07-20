import fc from 'fast-check';
import { selectSource, TahunAjaranCandidate } from '../select-source';

/**
 * Feature: auto-generate-kelas, Property 1: Source selection returns the most recent tahun ajaran with kelas
 *
 * For any set of tahun_ajaran records within the same tenant (with varying statuses,
 * dates, and kelas counts including zero), the source selection algorithm SHALL return
 * the tahun_ajaran with the greatest tanggalMulai (using createdAt as tiebreaker) that
 * has at least one kelas record, excluding the newly created tahun_ajaran. If no candidate
 * has kelas records, the result SHALL be null.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 6.1**
 */
describe('Feature: auto-generate-kelas, Property 1: Source selection returns the most recent tahun ajaran with kelas', () => {
  // --- Arbitraries ---

  const statusArb = fc.constantFrom('disiapkan', 'aktif', 'nonaktif');

  // Generate date strings in YYYY-MM-DD format
  const dateStringArb = fc
    .date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') })
    .map((d) => d.toISOString().slice(0, 10));

  // Generate createdAt timestamps
  const createdAtArb = fc.date({
    min: new Date('2000-01-01T00:00:00Z'),
    max: new Date('2099-12-31T23:59:59Z'),
  });

  // kelasCount: 0 means no kelas, >0 means has kelas
  const kelasCountArb = fc.nat({ max: 20 });

  const candidateArb = fc.record({
    id: fc.uuid(),
    tanggalMulai: dateStringArb,
    createdAt: createdAtArb,
    kelasCount: kelasCountArb,
    status: statusArb,
  });

  // Generate a non-empty array of candidates plus a separate excludeId
  const candidatesWithExcludeArb = fc
    .tuple(fc.array(candidateArb, { minLength: 1, maxLength: 20 }), fc.uuid())
    .filter(([candidates, excludeId]) => {
      // Ensure excludeId doesn't accidentally collide with all candidates
      // (we just need at least one candidate that isn't the excludeId)
      return candidates.some((c) => c.id !== excludeId);
    });

  it('selects the candidate with greatest tanggalMulai (then createdAt) that has kelasCount > 0, excluding excludeId', () => {
    fc.assert(
      fc.property(candidatesWithExcludeArb, ([candidates, excludeId]) => {
        const result = selectSource(candidates, excludeId);

        // Compute expected result manually
        const eligible = candidates.filter((c) => c.id !== excludeId && c.kelasCount > 0);

        if (eligible.length === 0) {
          // No eligible candidates → result should be null
          expect(result).toBeNull();
        } else {
          // Find the expected winner: max by tanggalMulai, then by createdAt
          const expected = eligible.reduce((best, current) => {
            if (current.tanggalMulai > best.tanggalMulai) return current;
            if (
              current.tanggalMulai === best.tanggalMulai &&
              current.createdAt.getTime() > best.createdAt.getTime()
            ) {
              return current;
            }
            return best;
          });

          expect(result).not.toBeNull();
          expect(result!.id).toBe(expected.id);
          expect(result!.tanggalMulai).toBe(expected.tanggalMulai);
          expect(result!.createdAt.getTime()).toBe(expected.createdAt.getTime());
        }
      }),
      { numRuns: 200 },
    );
  });

  it('returns null when all candidates have zero kelas (excluding excludeId)', () => {
    const zeroKelasCandidate = fc.record({
      id: fc.uuid(),
      tanggalMulai: dateStringArb,
      createdAt: createdAtArb,
      kelasCount: fc.constant(0),
      status: statusArb,
    });

    fc.assert(
      fc.property(
        fc.array(zeroKelasCandidate, { minLength: 1, maxLength: 20 }),
        fc.uuid(),
        (candidates, excludeId) => {
          const result = selectSource(candidates, excludeId);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('never returns the excludeId candidate even if it has the most recent date and kelas', () => {
    fc.assert(
      fc.property(fc.array(candidateArb, { minLength: 1, maxLength: 20 }), (candidates) => {
        // Use the first candidate's ID as the excludeId
        const excludeId = candidates[0].id;
        // Make the excluded candidate the "best" one
        const boostedCandidates: TahunAjaranCandidate[] = candidates.map((c, i) =>
          i === 0
            ? {
                ...c,
                tanggalMulai: '2099-12-31',
                createdAt: new Date('2099-12-31T23:59:59Z'),
                kelasCount: 100,
              }
            : c,
        );

        const result = selectSource(boostedCandidates, excludeId);

        // The result must never be the excluded candidate
        if (result !== null) {
          expect(result.id).not.toBe(excludeId);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('selects source regardless of status (disiapkan, aktif, nonaktif are all eligible)', () => {
    // Generate exactly 3 candidates with different statuses but only one has kelas
    const statusSpecificArb = fc
      .tuple(dateStringArb, createdAtArb, fc.uuid())
      .map(([tanggalMulai, createdAt, id]) => {
        const statuses: Array<'disiapkan' | 'aktif' | 'nonaktif'> = [
          'disiapkan',
          'aktif',
          'nonaktif',
        ];
        return statuses.map((status, i) => ({
          id: `${id}-${i}`,
          tanggalMulai,
          createdAt,
          kelasCount: 0,
          status,
        }));
      });

    fc.assert(
      fc.property(
        statusSpecificArb,
        statusArb,
        fc.uuid(),
        dateStringArb,
        createdAtArb,
        (baseCandidates, winnerStatus, winnerId, winnerDate, winnerCreatedAt) => {
          // Add a single candidate with kelas that has a specific status
          const winnerCandidate: TahunAjaranCandidate = {
            id: winnerId,
            tanggalMulai: winnerDate,
            createdAt: winnerCreatedAt,
            kelasCount: 5,
            status: winnerStatus,
          };

          const allCandidates = [...baseCandidates, winnerCandidate];
          const excludeId = 'exclude-me';

          const result = selectSource(allCandidates, excludeId);

          // The winner should always be selected regardless of its status
          expect(result).not.toBeNull();
          expect(result!.id).toBe(winnerId);
        },
      ),
      { numRuns: 200 },
    );
  });
});
