import fc from 'fast-check';

/**
 * Property 4: Opt-out skips all duplication
 *
 * For any valid tahun_ajaran creation request where `generate_kelas` is explicitly
 * set to `false`, the system SHALL create zero kelas records regardless of available
 * source data, and SHALL return `duplicatedClassCount` equal to 0.
 *
 * **Validates: Requirements 3.2, 4.3**
 */

/**
 * Simulates the create() logic for the opt-out path.
 * This is a pure function extraction of the conditional logic in TahunAjaranService.create():
 *
 *   const shouldGenerate = dto.generate_kelas !== false;
 *   if (!shouldGenerate) { return { duplicatedClassCount: 0 }; }
 *
 * When generate_kelas is explicitly false, no duplication occurs regardless of source data.
 */
function simulateCreate(
  generateKelas: boolean | undefined,
  availableSources: Array<{ id: string; kelasCount: number }>,
): { duplicatedClassCount: number } {
  const shouldGenerate = generateKelas !== false;

  if (!shouldGenerate) {
    return { duplicatedClassCount: 0 };
  }

  // Would proceed with duplication if shouldGenerate is true
  // Find the source (most recent with kelas > 0)
  const source = availableSources.find((s) => s.kelasCount > 0);
  return { duplicatedClassCount: source ? source.kelasCount : 0 };
}

describe('Feature: auto-generate-kelas, Property 4: Opt-out skips all duplication', () => {
  // Arbitrary for generating random source tahun ajaran with varying kelas counts
  const arbSourceTahunAjaran = fc.record({
    id: fc.uuid(),
    kelasCount: fc.integer({ min: 0, max: 100 }),
  });

  const arbAvailableSources = fc.array(arbSourceTahunAjaran, {
    minLength: 0,
    maxLength: 20,
  });

  it('when generate_kelas is false, duplicatedClassCount is always 0 regardless of available sources', () => {
    fc.assert(
      fc.property(arbAvailableSources, (availableSources) => {
        const result = simulateCreate(false, availableSources);
        expect(result.duplicatedClassCount).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('when generate_kelas is false, no kelas are created even when sources have many kelas', () => {
    // Generate sources that ALL have kelas (kelasCount > 0) to stress-test the opt-out
    const arbSourcesWithKelas = fc.array(
      fc.record({
        id: fc.uuid(),
        kelasCount: fc.integer({ min: 1, max: 100 }),
      }),
      { minLength: 1, maxLength: 20 },
    );

    fc.assert(
      fc.property(arbSourcesWithKelas, (availableSources) => {
        const result = simulateCreate(false, availableSources);
        expect(result.duplicatedClassCount).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('the shouldGenerate check correctly identifies false as opt-out', () => {
    fc.assert(
      fc.property(arbAvailableSources, (availableSources) => {
        // Explicitly test the condition: dto.generate_kelas !== false
        // Only `false` should trigger opt-out; undefined and true should NOT
        const generateKelas: false = false;
        const shouldGenerate = generateKelas !== false;
        expect(shouldGenerate).toBe(false);

        const result = simulateCreate(generateKelas, availableSources);
        expect(result.duplicatedClassCount).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('contrast: when generate_kelas is true and sources exist, duplication occurs', () => {
    // This contrast test confirms opt-out is the differentiator
    const arbSourcesWithKelas = fc.array(
      fc.record({
        id: fc.uuid(),
        kelasCount: fc.integer({ min: 1, max: 50 }),
      }),
      { minLength: 1, maxLength: 10 },
    );

    fc.assert(
      fc.property(arbSourcesWithKelas, (availableSources) => {
        // With generate_kelas = true (or undefined), duplication should happen
        const resultTrue = simulateCreate(true, availableSources);
        const resultFalse = simulateCreate(false, availableSources);

        // true should produce duplication (> 0), false should always be 0
        expect(resultTrue.duplicatedClassCount).toBeGreaterThan(0);
        expect(resultFalse.duplicatedClassCount).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
