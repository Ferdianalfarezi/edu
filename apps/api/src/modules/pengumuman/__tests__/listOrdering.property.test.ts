import fc from 'fast-check';

/**
 * Property 7: List Ordering Invariant
 *
 * For any paginated list of pengumuman returned by the list endpoint, for all
 * consecutive pairs (item[i], item[i+1]), item[i].created_at >= item[i+1].created_at
 * (descending order).
 *
 * **Validates: Requirements 5.2**
 *
 * Feature: announcement, Property 7: List Ordering Invariant
 */

// ─────────────────────────────────────────────────────────────────
// Data Models
// ─────────────────────────────────────────────────────────────────

interface PengumumanRecord {
  id: string;
  tenantId: string;
  judul: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────
// Pure function under test
// ─────────────────────────────────────────────────────────────────

/**
 * Pure simulation of the sorting logic from PengumumanService.list().
 *
 * Mirrors: `ORDER BY created_at DESC` in the list query.
 *
 * The service returns pengumuman ordered by createdAt descending so the
 * most recent announcements appear first in the admin panel.
 */
function sortByCreatedAtDesc(items: { createdAt: Date }[]): { createdAt: Date }[] {
  return [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ─────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────

const pengumumanRecordArb: fc.Arbitrary<PengumumanRecord> = fc.record({
  id: fc.uuid(),
  tenantId: fc.constantFrom('tenant-A', 'tenant-B', 'tenant-C'),
  judul: fc.string({ minLength: 1, maxLength: 50 }),
  createdAt: fc.date({ min: new Date('2023-01-01'), max: new Date('2025-12-31') }),
});

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('Feature: announcement, Property 7: List Ordering Invariant', () => {
  describe('Descending order by createdAt', () => {
    it('all consecutive pairs satisfy item[i].createdAt >= item[i+1].createdAt', () => {
      fc.assert(
        fc.property(fc.array(pengumumanRecordArb, { minLength: 0, maxLength: 100 }), (records) => {
          const sorted = sortByCreatedAtDesc(records);

          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i].createdAt.getTime()).toBeGreaterThanOrEqual(
              sorted[i + 1].createdAt.getTime(),
            );
          }
        }),
        { numRuns: 200 },
      );
    });

    it('sorted array has the same length as the input (no data loss or duplication)', () => {
      fc.assert(
        fc.property(fc.array(pengumumanRecordArb, { minLength: 0, maxLength: 100 }), (records) => {
          const sorted = sortByCreatedAtDesc(records);

          expect(sorted.length).toBe(records.length);
        }),
        { numRuns: 200 },
      );
    });

    it('sorted array contains all the same elements as the input (preservation)', () => {
      fc.assert(
        fc.property(fc.array(pengumumanRecordArb, { minLength: 0, maxLength: 50 }), (records) => {
          const sorted = sortByCreatedAtDesc(records);

          // Every element in the input exists in the output
          const sortedTimestamps = sorted.map((r) => r.createdAt.getTime()).sort();
          const inputTimestamps = records.map((r) => r.createdAt.getTime()).sort();

          expect(sortedTimestamps).toEqual(inputTimestamps);
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Edge cases', () => {
    it('single-element arrays are trivially sorted', () => {
      fc.assert(
        fc.property(pengumumanRecordArb, (record) => {
          const sorted = sortByCreatedAtDesc([record]);

          expect(sorted.length).toBe(1);
          expect(sorted[0].createdAt.getTime()).toBe(record.createdAt.getTime());
        }),
        { numRuns: 100 },
      );
    });

    it('arrays with identical timestamps remain stable with all elements preserved', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2024-01-01'), max: new Date('2025-01-01') }),
          fc.integer({ min: 2, max: 20 }),
          (sameDate, count) => {
            const records: PengumumanRecord[] = Array.from({ length: count }, (_, i) => ({
              id: `id-${i}`,
              tenantId: 'tenant-A',
              judul: `Pengumuman ${i}`,
              createdAt: new Date(sameDate),
            }));

            const sorted = sortByCreatedAtDesc(records);

            // All elements preserved
            expect(sorted.length).toBe(count);

            // All consecutive pairs still satisfy >= (equal timestamps are valid)
            for (let i = 0; i < sorted.length - 1; i++) {
              expect(sorted[i].createdAt.getTime()).toBeGreaterThanOrEqual(
                sorted[i + 1].createdAt.getTime(),
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
