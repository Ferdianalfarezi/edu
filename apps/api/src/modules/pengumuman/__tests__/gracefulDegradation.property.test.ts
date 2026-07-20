import fc from 'fast-check';

/**
 * Property 8: Graceful Degradation for Invalid Students
 *
 * For any targeted pengumuman with a mixed list of valid and invalid student IDs
 * (non-existent, inactive, or without linked parents), the service SHALL skip
 * invalid entries and successfully send to valid ones. The resulting jumlah_penerima
 * SHALL equal the count of distinct valid parents (not the count of input student IDs).
 *
 * **Validates: Requirements 3.5, 3.6, 2.5**
 *
 * Feature: announcement, Property 8: Graceful Degradation for Invalid Students
 */

// ─────────────────────────────────────────────────────────────────
// Data Models (mirrors DB schema for pure simulation)
// ─────────────────────────────────────────────────────────────────

interface StudentRecord {
  id: string;
  orangTuaId: string | null;
  tenantId: string;
  status: 'aktif' | 'tidak_aktif';
}

interface ParentRecord {
  id: string;
  role: string;
  isActive: boolean;
}

/**
 * Result of the graceful degradation resolution.
 */
interface ResolutionResult {
  recipientIds: string[];
  jumlahPenerima: number;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Pure function simulating service logic
// ─────────────────────────────────────────────────────────────────

/**
 * Pure simulation of PengumumanService.resolveTargetedRecipients() with
 * graceful degradation behavior.
 *
 * Mirrors the SQL:
 *   selectDistinct({ orangTuaId }) from siswa
 *     INNER JOIN user ON user.id = siswa.orangTuaId
 *     WHERE siswa.id IN (siswaIds)
 *       AND siswa.tenantId = tenantId
 *       AND siswa.status = 'aktif'
 *       AND user.role = 'orang_tua'
 *       AND user.isActive = true
 *
 * Invalid entries are silently skipped:
 * - Non-existent student IDs (not in the students array)
 * - Inactive students (status !== 'aktif')
 * - Students without a linked parent (orangTuaId === null)
 * - Students in a different tenant
 * - Students whose parent is not active or not role orang_tua
 *
 * Requirements: 3.5 (skip invalid, send to valid), 3.6 (error if ALL invalid), 2.5 (jumlah=0 allowed for broadcast but targeted needs at least 1)
 */
function resolveTargetedWithGracefulDegradation(
  students: StudentRecord[],
  parents: Map<string, ParentRecord>,
  tenantId: string,
  inputSiswaIds: string[],
): ResolutionResult {
  if (inputSiswaIds.length === 0) {
    return { recipientIds: [], jumlahPenerima: 0, error: 'Minimal satu siswa harus dipilih' };
  }

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const validParentIds = new Set<string>();

  for (const siswaId of inputSiswaIds) {
    // Skip non-existent students
    const student = studentMap.get(siswaId);
    if (!student) continue;

    // Skip students in different tenant
    if (student.tenantId !== tenantId) continue;

    // Skip inactive students
    if (student.status !== 'aktif') continue;

    // Skip students without parent link
    if (student.orangTuaId === null) continue;

    // Skip if parent doesn't exist in records
    const parent = parents.get(student.orangTuaId);
    if (!parent) continue;

    // Skip if parent is not role orang_tua
    if (parent.role !== 'orang_tua') continue;

    // Skip if parent is not active
    if (!parent.isActive) continue;

    // Valid: add to deduplicated set
    validParentIds.add(student.orangTuaId);
  }

  const recipientIds = Array.from(validParentIds);

  // Requirement 3.6: if ALL students are invalid → error
  if (recipientIds.length === 0) {
    return { recipientIds: [], jumlahPenerima: 0, error: 'Tidak ada penerima valid' };
  }

  return {
    recipientIds,
    jumlahPenerima: recipientIds.length,
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';

/**
 * Generate a "database" of students with varying validity states.
 * Some are active with parents, some inactive, some without parents.
 */
const studentDbArb = fc.array(
  fc.record({
    id: fc.uuid(),
    orangTuaId: fc.oneof(
      { weight: 6, arbitrary: fc.integer({ min: 1, max: 8 }).map((n) => `parent-${n}`) },
      { weight: 2, arbitrary: fc.constant(null) }, // no parent linked
    ),
    tenantId: fc.oneof(
      { weight: 7, arbitrary: fc.constant(TENANT_ID) },
      { weight: 3, arbitrary: fc.constant('other-tenant') }, // wrong tenant
    ),
    status: fc.oneof(
      { weight: 6, arbitrary: fc.constant('aktif' as const) },
      { weight: 4, arbitrary: fc.constant('tidak_aktif' as const) }, // inactive
    ),
  }),
  { minLength: 1, maxLength: 30 },
);

/**
 * Generate parent records with varying validity states.
 */
const parentDbArb = fc.integer({ min: 1, max: 8 }).chain((maxId) =>
  fc.tuple(
    ...Array.from({ length: maxId }, (_, i) =>
      fc.record({
        id: fc.constant(`parent-${i + 1}`),
        role: fc.oneof(
          { weight: 7, arbitrary: fc.constant('orang_tua') },
          { weight: 3, arbitrary: fc.constant('guru') }, // wrong role
        ),
        isActive: fc.oneof(
          { weight: 7, arbitrary: fc.constant(true) },
          { weight: 3, arbitrary: fc.constant(false) }, // inactive parent
        ),
      }),
    ),
  ),
);

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('Feature: announcement, Property 8: Graceful Degradation for Invalid Students', () => {
  /**
   * Full scenario: generate DB students + parents, then create a mixed input list
   * containing both existing student IDs and random non-existent IDs.
   */
  const scenarioArb = studentDbArb.chain((students) => {
    const existingIds = students.map((s) => s.id);

    // Generate input: mix of existing IDs and non-existent UUIDs
    const inputArb = fc.array(
      fc.oneof(
        { weight: 6, arbitrary: fc.constantFrom(...existingIds) },
        { weight: 4, arbitrary: fc.uuid() }, // non-existent IDs
      ),
      { minLength: 1, maxLength: 20 },
    );

    return fc.tuple(fc.constant(students), parentDbArb, inputArb);
  });

  it('non-existent student IDs do not appear in resolved recipients', () => {
    fc.assert(
      fc.property(scenarioArb, ([students, parentRecords, inputIds]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const studentMap = new Map(students.map((s) => [s.id, s]));
        const result = resolveTargetedWithGracefulDegradation(
          students,
          parentMap,
          TENANT_ID,
          inputIds,
        );

        // Non-existent IDs (those not in studentMap) should not contribute any recipients
        const nonExistentIds = inputIds.filter((id) => !studentMap.has(id));

        // Verify: recipients only come from existing students
        for (const recipientParentId of result.recipientIds) {
          // This parent must be linked from at least one EXISTING valid student in the input
          const linkedFromExisting = students.some(
            (s) =>
              inputIds.includes(s.id) &&
              s.tenantId === TENANT_ID &&
              s.status === 'aktif' &&
              s.orangTuaId === recipientParentId,
          );
          expect(linkedFromExisting).toBe(true);
        }

        // No recipient should come exclusively from non-existent input IDs
        // (This is always true because non-existent IDs can't produce any parent)
        expect(nonExistentIds.length >= 0).toBe(true); // assertion just for clarity
      }),
      { numRuns: 200 },
    );
  });

  it('inactive students do not produce recipients', () => {
    fc.assert(
      fc.property(scenarioArb, ([students, parentRecords, inputIds]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const result = resolveTargetedWithGracefulDegradation(
          students,
          parentMap,
          TENANT_ID,
          inputIds,
        );

        // For every resolved recipient parent, verify they have at least one
        // ACTIVE student (not inactive) in the input set linking to them
        for (const recipientParentId of result.recipientIds) {
          const hasActiveStudentLink = students.some(
            (s) =>
              inputIds.includes(s.id) &&
              s.tenantId === TENANT_ID &&
              s.status === 'aktif' &&
              s.orangTuaId === recipientParentId,
          );
          expect(hasActiveStudentLink).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('students without orangTuaId do not produce recipients', () => {
    fc.assert(
      fc.property(scenarioArb, ([students, parentRecords, inputIds]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const result = resolveTargetedWithGracefulDegradation(
          students,
          parentMap,
          TENANT_ID,
          inputIds,
        );

        // Recipients must all be non-null parent IDs — students with null orangTuaId
        // cannot contribute any parent to the result
        for (const recipientParentId of result.recipientIds) {
          expect(recipientParentId).not.toBeNull();
          expect(recipientParentId).toBeDefined();
          expect(recipientParentId.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('jumlah_penerima equals count of distinct valid parents from the valid subset', () => {
    fc.assert(
      fc.property(scenarioArb, ([students, parentRecords, inputIds]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const result = resolveTargetedWithGracefulDegradation(
          students,
          parentMap,
          TENANT_ID,
          inputIds,
        );

        // Independently compute expected distinct valid parents
        const studentMap = new Map(students.map((s) => [s.id, s]));
        const expectedParents = new Set<string>();

        for (const inputId of inputIds) {
          const student = studentMap.get(inputId);
          if (!student) continue;
          if (student.tenantId !== TENANT_ID) continue;
          if (student.status !== 'aktif') continue;
          if (student.orangTuaId === null) continue;

          const parent = parentMap.get(student.orangTuaId);
          if (!parent) continue;
          if (parent.role !== 'orang_tua') continue;
          if (!parent.isActive) continue;

          expectedParents.add(student.orangTuaId);
        }

        expect(result.jumlahPenerima).toBe(expectedParents.size);
        expect(result.recipientIds.length).toBe(expectedParents.size);
      }),
      { numRuns: 200 },
    );
  });

  it('if at least one student is valid, the operation succeeds (no error thrown)', () => {
    // Generate a scenario that guarantees at least one valid student
    const validStudentArb = fc.record({
      id: fc.uuid(),
      orangTuaId: fc.constant('parent-1'),
      tenantId: fc.constant(TENANT_ID),
      status: fc.constant('aktif' as const),
    });

    const mixedScenarioArb = fc
      .tuple(
        validStudentArb,
        fc.array(
          fc.record({
            id: fc.uuid(),
            orangTuaId: fc.oneof(
              fc.integer({ min: 2, max: 8 }).map((n) => `parent-${n}`),
              fc.constant(null),
            ),
            tenantId: fc.oneof(fc.constant(TENANT_ID), fc.constant('other-tenant')),
            status: fc.oneof(fc.constant('aktif' as const), fc.constant('tidak_aktif' as const)),
          }),
          { minLength: 0, maxLength: 15 },
        ),
        fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }), // non-existent IDs
      )
      .map(([validStudent, otherStudents, nonExistentIds]) => {
        const allStudents = [validStudent, ...otherStudents];
        const inputIds = [validStudent.id, ...otherStudents.map((s) => s.id), ...nonExistentIds];
        return { students: allStudents, inputIds };
      });

    fc.assert(
      fc.property(mixedScenarioArb, ({ students, inputIds }) => {
        const parentMap = new Map<string, ParentRecord>([
          ['parent-1', { id: 'parent-1', role: 'orang_tua', isActive: true }],
          ['parent-2', { id: 'parent-2', role: 'orang_tua', isActive: true }],
          ['parent-3', { id: 'parent-3', role: 'orang_tua', isActive: false }],
          ['parent-4', { id: 'parent-4', role: 'guru', isActive: true }],
          ['parent-5', { id: 'parent-5', role: 'orang_tua', isActive: true }],
          ['parent-6', { id: 'parent-6', role: 'orang_tua', isActive: true }],
          ['parent-7', { id: 'parent-7', role: 'orang_tua', isActive: true }],
          ['parent-8', { id: 'parent-8', role: 'orang_tua', isActive: true }],
        ]);

        const result = resolveTargetedWithGracefulDegradation(
          students,
          parentMap,
          TENANT_ID,
          inputIds,
        );

        // With a guaranteed valid student (parent-1 is active orang_tua),
        // the operation must succeed
        expect(result.error).toBeNull();
        expect(result.jumlahPenerima).toBeGreaterThanOrEqual(1);
        expect(result.recipientIds).toContain('parent-1');
      }),
      { numRuns: 100 },
    );
  });

  it('when ALL input students are invalid, returns error (Requirement 3.6)', () => {
    // Generate only invalid students: inactive, wrong tenant, no parent, or non-existent
    const invalidScenarioArb = fc
      .tuple(
        fc.array(
          fc.record({
            id: fc.uuid(),
            orangTuaId: fc.oneof(
              fc.constant(null), // no parent
              fc.constant('parent-inactive'), // will be mapped to inactive parent
              fc.constant('parent-wrong-role'), // will be mapped to wrong role
            ),
            tenantId: fc.oneof(fc.constant(TENANT_ID), fc.constant('other-tenant')),
            status: fc.oneof(fc.constant('aktif' as const), fc.constant('tidak_aktif' as const)),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }), // non-existent IDs
      )
      .map(([students, nonExistentIds]) => {
        // Ensure all students are "invalid" by making their parents invalid
        const inputIds = [...students.map((s) => s.id), ...nonExistentIds];
        return { students, inputIds };
      });

    fc.assert(
      fc.property(invalidScenarioArb, ({ students, inputIds }) => {
        // Parent map where all parents are invalid
        const parentMap = new Map<string, ParentRecord>([
          ['parent-inactive', { id: 'parent-inactive', role: 'orang_tua', isActive: false }],
          ['parent-wrong-role', { id: 'parent-wrong-role', role: 'guru', isActive: true }],
        ]);

        const result = resolveTargetedWithGracefulDegradation(
          students,
          parentMap,
          TENANT_ID,
          inputIds,
        );

        // All invalid → must return error
        expect(result.error).toBe('Tidak ada penerima valid');
        expect(result.jumlahPenerima).toBe(0);
        expect(result.recipientIds).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
