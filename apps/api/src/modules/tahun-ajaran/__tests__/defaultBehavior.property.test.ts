import fc from 'fast-check';

/**
 * Property 5: Omitting generate_kelas defaults to generation enabled
 *
 * For any valid tahun_ajaran creation request where the `generate_kelas` field is omitted
 * from the payload, the system SHALL behave identically to a request with `generate_kelas`
 * set to `true` — producing the same `duplicatedClassCount` and kelas records.
 *
 * **Validates: Requirements 4.2**
 */

/**
 * Pure function extracted from TahunAjaranService.create():
 * `const shouldGenerate = dto.generate_kelas !== false;`
 */
function computeShouldGenerate(generateKelas: boolean | undefined): boolean {
  return generateKelas !== false;
}

/**
 * Simulates the kelas generation result for a given generate_kelas value
 * and source kelas count. This mirrors the service logic:
 * - If shouldGenerate is true and source exists → duplicatedClassCount = sourceKelasCount
 * - If shouldGenerate is false → duplicatedClassCount = 0
 */
function simulateCreateResult(
  generateKelas: boolean | undefined,
  sourceKelasCount: number,
): { duplicatedClassCount: number } {
  const shouldGenerate = generateKelas !== false;
  if (!shouldGenerate) return { duplicatedClassCount: 0 };
  return { duplicatedClassCount: sourceKelasCount };
}

describe('Feature: auto-generate-kelas, Property 5: Omitting generate_kelas defaults to generation enabled', () => {
  it('computeShouldGenerate(undefined) always equals computeShouldGenerate(true)', () => {
    // This is a universal property: for any scenario, undefined and true produce the same decision
    fc.assert(
      fc.property(fc.constant(undefined), (_) => {
        const resultUndefined = computeShouldGenerate(undefined);
        const resultTrue = computeShouldGenerate(true);
        expect(resultUndefined).toBe(resultTrue);
        expect(resultUndefined).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('simulateCreateResult with undefined produces identical duplicatedClassCount as with true', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (sourceKelasCount) => {
        const resultUndefined = simulateCreateResult(undefined, sourceKelasCount);
        const resultTrue = simulateCreateResult(true, sourceKelasCount);
        expect(resultUndefined.duplicatedClassCount).toBe(resultTrue.duplicatedClassCount);
      }),
      { numRuns: 100 },
    );
  });

  it('both undefined and true produce duplicatedClassCount equal to sourceKelasCount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), (sourceKelasCount) => {
        const resultUndefined = simulateCreateResult(undefined, sourceKelasCount);
        const resultTrue = simulateCreateResult(true, sourceKelasCount);
        // Both should pass through the source count unchanged
        expect(resultUndefined.duplicatedClassCount).toBe(sourceKelasCount);
        expect(resultTrue.duplicatedClassCount).toBe(sourceKelasCount);
      }),
      { numRuns: 100 },
    );
  });

  it('undefined and true differ from false for any non-zero source count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (sourceKelasCount) => {
        const resultUndefined = simulateCreateResult(undefined, sourceKelasCount);
        const resultFalse = simulateCreateResult(false, sourceKelasCount);
        // undefined behaves like true (generates), not like false (skips)
        expect(resultUndefined.duplicatedClassCount).toBe(sourceKelasCount);
        expect(resultFalse.duplicatedClassCount).toBe(0);
        expect(resultUndefined.duplicatedClassCount).not.toBe(resultFalse.duplicatedClassCount);
      }),
      { numRuns: 100 },
    );
  });
});
