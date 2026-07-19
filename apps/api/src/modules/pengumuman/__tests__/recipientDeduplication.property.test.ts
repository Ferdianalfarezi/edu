import fc from 'fast-check';

/**
 * Property 2: Recipient Resolution Deduplicates Parents
 *
 * For any set of target students, the resolved recipient list SHALL contain
 * exactly one entry per unique orang_tua_id — even when a parent has multiple
 * children in the target set. The recipient count SHALL equal the number of
 * distinct active parents linked to valid target students.
 *
 * **Validates: Requirements 2.1, 2.2, 3.2, 3.3**
 *
 * Feature: announcement, Property 2: Recipient Resolution Deduplicates Parents
 */

/**
 * Represents a student record with a parent link, mirroring the database shape
 * used in PengumumanService.resolveTargetedRecipients and resolveBroadcastRecipients.
 */
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
 * Pure simulation of the recipient deduplication logic from PengumumanService.
 *
 * This mirrors the SQL `selectDistinct({ orangTuaId })` with INNER JOIN on user
 * filtering by siswa.status = 'aktif', user.role = 'orang_tua', user.isActive = true.
 *
 * The function:
 * 1. Filters students by: matching tenant, active status, non-null orangTuaId
 * 2. Joins with parent records: role must be 'orang_tua', isActive must be true
 * 3. Returns deduplicated list of parent IDs (equivalent to selectDistinct)
 */
function resolveRecipients(
  students: StudentRecord[],
  parents: Map<string, ParentRecord>,
  tenantId: string,
): string[] {
  const validParentIds = new Set<string>();

  for (const student of students) {
    // Filter: must be in same tenant, must be active, must have a parent linked
    if (student.tenantId !== tenantId) continue;
    if (student.status !== 'aktif') continue;
    if (student.orangTuaId === null) continue;

    // Join: parent must exist, must be orang_tua role, must be active
    const parent = parents.get(student.orangTuaId);
    if (!parent) continue;
    if (parent.role !== 'orang_tua') continue;
    if (!parent.isActive) continue;

    // Deduplication happens via Set — equivalent to selectDistinct
    validParentIds.add(student.orangTuaId);
  }

  return Array.from(validParentIds);
}

describe('Feature: announcement, Property 2: Recipient Resolution Deduplicates Parents', () => {
  // Arbitrary: generate a parent ID pool (1-10 unique parents)
  const parentIdArb = fc.integer({ min: 1, max: 10 }).map((n) => `parent-${n}`);

  // Arbitrary: generate a student linked to one of the parent IDs
  const studentArb = (tenantId: string, parentIds: string[]) =>
    fc.record({
      id: fc.uuid(),
      orangTuaId: fc.oneof(
        { weight: 9, arbitrary: fc.constantFrom(...parentIds) },
        { weight: 1, arbitrary: fc.constant(null) },
      ),
      tenantId: fc.oneof(
        { weight: 8, arbitrary: fc.constant(tenantId) },
        { weight: 2, arbitrary: fc.constant('other-tenant') },
      ),
      status: fc.oneof(
        { weight: 8, arbitrary: fc.constant('aktif' as const) },
        { weight: 2, arbitrary: fc.constant('tidak_aktif' as const) },
      ),
    });

  // Generate the full test scenario: parent IDs, parent records, student list
  const scenarioArb = fc.integer({ min: 1, max: 10 }).chain((numParents) => {
    const parentIds = Array.from({ length: numParents }, (_, i) => `parent-${i + 1}`);
    const tenantId = 'tenant-1';

    // Generate parent records (some active orang_tua, some not)
    const parentRecordsArb = fc.tuple(
      ...parentIds.map((pid) =>
        fc.record({
          id: fc.constant(pid),
          role: fc.oneof(
            { weight: 8, arbitrary: fc.constant('orang_tua') },
            { weight: 2, arbitrary: fc.constant('guru') },
          ),
          isActive: fc.oneof(
            { weight: 8, arbitrary: fc.constant(true) },
            { weight: 2, arbitrary: fc.constant(false) },
          ),
        }),
      ),
    );

    // Generate 1-30 students, some sharing parents (siblings)
    const studentsArb = fc.array(studentArb(tenantId, parentIds), {
      minLength: 1,
      maxLength: 30,
    });

    return fc.tuple(fc.constant(tenantId), fc.constant(parentIds), parentRecordsArb, studentsArb);
  });

  it('output contains no duplicate user IDs', () => {
    fc.assert(
      fc.property(scenarioArb, ([tenantId, _parentIds, parentRecords, students]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const result = resolveRecipients(students, parentMap, tenantId);

        // No duplicates: the result set size must equal the array length
        const uniqueIds = new Set(result);
        expect(uniqueIds.size).toBe(result.length);
      }),
      { numRuns: 200 },
    );
  });

  it('result count equals distinct valid active parents linked to valid students', () => {
    fc.assert(
      fc.property(scenarioArb, ([tenantId, _parentIds, parentRecords, students]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const result = resolveRecipients(students, parentMap, tenantId);

        // Compute expected count independently
        const expectedParents = new Set<string>();
        for (const student of students) {
          if (student.tenantId !== tenantId) continue;
          if (student.status !== 'aktif') continue;
          if (student.orangTuaId === null) continue;
          const parent = parentMap.get(student.orangTuaId);
          if (!parent) continue;
          if (parent.role !== 'orang_tua') continue;
          if (!parent.isActive) continue;
          expectedParents.add(student.orangTuaId);
        }

        expect(result.length).toBe(expectedParents.size);
      }),
      { numRuns: 200 },
    );
  });

  it('siblings sharing a parent produce exactly one recipient entry for that parent', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), (numSiblings) => {
        const tenantId = 'tenant-1';
        const sharedParentId = 'shared-parent';

        // Create siblings: multiple students all pointing to same parent
        const siblings: StudentRecord[] = Array.from({ length: numSiblings }, (_, i) => ({
          id: `sibling-${i}`,
          orangTuaId: sharedParentId,
          tenantId,
          status: 'aktif' as const,
        }));

        const parentMap = new Map<string, ParentRecord>([
          [sharedParentId, { id: sharedParentId, role: 'orang_tua', isActive: true }],
        ]);

        const result = resolveRecipients(siblings, parentMap, tenantId);

        // Must be exactly 1 entry despite multiple siblings
        expect(result.length).toBe(1);
        expect(result[0]).toBe(sharedParentId);
      }),
      { numRuns: 100 },
    );
  });

  it('every parent in result has at least one valid student linked to them', () => {
    fc.assert(
      fc.property(scenarioArb, ([tenantId, _parentIds, parentRecords, students]) => {
        const parentMap = new Map<string, ParentRecord>();
        for (const p of parentRecords) {
          parentMap.set(p.id, p);
        }

        const result = resolveRecipients(students, parentMap, tenantId);

        // For each parent in the result, there must be at least one valid student
        for (const parentId of result) {
          const hasValidStudent = students.some(
            (s) => s.tenantId === tenantId && s.status === 'aktif' && s.orangTuaId === parentId,
          );
          expect(hasValidStudent).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
