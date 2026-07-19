import fc from 'fast-check';

/**
 * Property 5: Tenant Isolation
 *
 * For any pengumuman query by an admin user with tenant_id = T, the list endpoint
 * SHALL return only pengumuman where pengumuman.tenant_id = T. Furthermore, for any
 * broadcast or targeted recipient resolution, all resolved recipients SHALL have at
 * least one active student with siswa.tenant_id = T.
 *
 * **Validates: Requirements 5.4, 7.2, 7.4**
 *
 * Feature: announcement, Property 5: Tenant Isolation
 */

// ─────────────────────────────────────────────────────────────────
// Data Models (mirrors DB schema for pure simulation)
// ─────────────────────────────────────────────────────────────────

interface PengumumanRecord {
  id: string;
  tenantId: string;
  judul: string;
  status: 'draft' | 'terkirim' | 'gagal';
  createdAt: Date;
}

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

// ─────────────────────────────────────────────────────────────────
// Pure functions simulating service logic
// ─────────────────────────────────────────────────────────────────

/**
 * Pure simulation of the list query filtering from PengumumanService.list().
 *
 * Mirrors: `WHERE pengumuman.tenant_id = tenantId ORDER BY created_at DESC`
 *
 * The service uses `eq(pengumuman.tenantId, tenantId)` as the WHERE clause,
 * ensuring only records belonging to the querying admin's tenant are returned.
 */
function filterPengumumanByTenant(
  allPengumuman: PengumumanRecord[],
  queryTenantId: string,
): PengumumanRecord[] {
  return allPengumuman
    .filter((p) => p.tenantId === queryTenantId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Pure simulation of broadcast recipient resolution from PengumumanService.
 *
 * Mirrors: selectDistinct({ orangTuaId }) from siswa
 *   INNER JOIN user ON user.id = siswa.orangTuaId
 *   WHERE siswa.tenantId = tenantId
 *     AND siswa.status = 'aktif'
 *     AND user.role = 'orang_tua'
 *     AND user.isActive = true
 *
 * Returns deduplicated parent IDs that have at least one active student in the tenant.
 */
function resolveBroadcastRecipients(
  students: StudentRecord[],
  parents: Map<string, ParentRecord>,
  tenantId: string,
): string[] {
  const validParentIds = new Set<string>();

  for (const student of students) {
    if (student.tenantId !== tenantId) continue;
    if (student.status !== 'aktif') continue;
    if (student.orangTuaId === null) continue;

    const parent = parents.get(student.orangTuaId);
    if (!parent) continue;
    if (parent.role !== 'orang_tua') continue;
    if (!parent.isActive) continue;

    validParentIds.add(student.orangTuaId);
  }

  return Array.from(validParentIds);
}

/**
 * Pure simulation of targeted recipient resolution from PengumumanService.
 *
 * Mirrors: selectDistinct({ orangTuaId }) from siswa
 *   INNER JOIN user ON user.id = siswa.orangTuaId
 *   WHERE siswa.id IN (siswaIds)
 *     AND siswa.tenantId = tenantId
 *     AND siswa.status = 'aktif'
 *     AND user.role = 'orang_tua'
 *     AND user.isActive = true
 */
function resolveTargetedRecipients(
  students: StudentRecord[],
  parents: Map<string, ParentRecord>,
  tenantId: string,
  targetSiswaIds: string[],
): string[] {
  const targetSet = new Set(targetSiswaIds);
  const validParentIds = new Set<string>();

  for (const student of students) {
    if (!targetSet.has(student.id)) continue;
    if (student.tenantId !== tenantId) continue;
    if (student.status !== 'aktif') continue;
    if (student.orangTuaId === null) continue;

    const parent = parents.get(student.orangTuaId);
    if (!parent) continue;
    if (parent.role !== 'orang_tua') continue;
    if (!parent.isActive) continue;

    validParentIds.add(student.orangTuaId);
  }

  return Array.from(validParentIds);
}

// ─────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────

const tenantIds = ['tenant-A', 'tenant-B', 'tenant-C'];

const tenantIdArb = fc.constantFrom(...tenantIds);

const pengumumanArb = fc.record({
  id: fc.uuid(),
  tenantId: tenantIdArb,
  judul: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom('draft' as const, 'terkirim' as const, 'gagal' as const),
  createdAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-01-01') }),
});

const studentArb = fc.record({
  id: fc.uuid(),
  orangTuaId: fc.oneof(
    { weight: 8, arbitrary: fc.integer({ min: 1, max: 10 }).map((n) => `parent-${n}`) },
    { weight: 2, arbitrary: fc.constant(null) },
  ),
  tenantId: tenantIdArb,
  status: fc.oneof(
    { weight: 7, arbitrary: fc.constant('aktif' as const) },
    { weight: 3, arbitrary: fc.constant('tidak_aktif' as const) },
  ),
});

const parentRecordArb = fc.integer({ min: 1, max: 10 }).chain((pid) =>
  fc.record({
    id: fc.constant(`parent-${pid}`),
    role: fc.oneof(
      { weight: 8, arbitrary: fc.constant('orang_tua') },
      { weight: 2, arbitrary: fc.constant('guru') },
    ),
    isActive: fc.oneof(
      { weight: 8, arbitrary: fc.constant(true) },
      { weight: 2, arbitrary: fc.constant(false) },
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('Feature: announcement, Property 5: Tenant Isolation', () => {
  describe('List query filtering', () => {
    it('returns only pengumuman with matching tenant_id — no cross-tenant leakage', () => {
      fc.assert(
        fc.property(
          fc.array(pengumumanArb, { minLength: 1, maxLength: 50 }),
          tenantIdArb,
          (allPengumuman, queryTenantId) => {
            const result = filterPengumumanByTenant(allPengumuman, queryTenantId);

            // Every item in result must belong to the queried tenant
            for (const item of result) {
              expect(item.tenantId).toBe(queryTenantId);
            }
          },
        ),
        { numRuns: 200 },
      );
    });

    it('never includes records from other tenants', () => {
      fc.assert(
        fc.property(
          fc.array(pengumumanArb, { minLength: 1, maxLength: 50 }),
          tenantIdArb,
          (allPengumuman, queryTenantId) => {
            const result = filterPengumumanByTenant(allPengumuman, queryTenantId);

            const otherTenantRecords = result.filter((p) => p.tenantId !== queryTenantId);
            expect(otherTenantRecords).toHaveLength(0);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('includes all pengumuman from the queried tenant (no silent drops)', () => {
      fc.assert(
        fc.property(
          fc.array(pengumumanArb, { minLength: 1, maxLength: 50 }),
          tenantIdArb,
          (allPengumuman, queryTenantId) => {
            const result = filterPengumumanByTenant(allPengumuman, queryTenantId);

            const expectedCount = allPengumuman.filter((p) => p.tenantId === queryTenantId).length;
            expect(result.length).toBe(expectedCount);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  describe('Broadcast recipient resolution tenant isolation', () => {
    const scenarioArb = fc.tuple(
      fc.array(studentArb, { minLength: 1, maxLength: 30 }),
      fc.array(parentRecordArb, { minLength: 1, maxLength: 10 }),
      tenantIdArb,
    );

    it('all resolved recipients have at least one active student in the query tenant', () => {
      fc.assert(
        fc.property(scenarioArb, ([students, parentRecords, queryTenantId]) => {
          const parentMap = new Map<string, ParentRecord>();
          for (const p of parentRecords) {
            parentMap.set(p.id, p);
          }

          const recipients = resolveBroadcastRecipients(students, parentMap, queryTenantId);

          // For each resolved recipient, there must exist at least one
          // active student in the query tenant linked to that parent
          for (const parentId of recipients) {
            const hasStudentInTenant = students.some(
              (s) =>
                s.tenantId === queryTenantId && s.status === 'aktif' && s.orangTuaId === parentId,
            );
            expect(hasStudentInTenant).toBe(true);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('never resolves parents linked only to students in other tenants', () => {
      fc.assert(
        fc.property(scenarioArb, ([students, parentRecords, queryTenantId]) => {
          const parentMap = new Map<string, ParentRecord>();
          for (const p of parentRecords) {
            parentMap.set(p.id, p);
          }

          const recipients = resolveBroadcastRecipients(students, parentMap, queryTenantId);

          // Find parents that have students ONLY in other tenants
          const parentsOnlyInOtherTenants = new Set<string>();
          for (const p of parentRecords) {
            const hasStudentInQueryTenant = students.some(
              (s) => s.tenantId === queryTenantId && s.status === 'aktif' && s.orangTuaId === p.id,
            );
            if (!hasStudentInQueryTenant) {
              parentsOnlyInOtherTenants.add(p.id);
            }
          }

          // None of these parents should appear in the result
          for (const parentId of recipients) {
            expect(parentsOnlyInOtherTenants.has(parentId)).toBe(false);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Targeted recipient resolution tenant isolation', () => {
    const targetedScenarioArb = fc
      .array(studentArb, { minLength: 1, maxLength: 30 })
      .chain((students) =>
        fc.tuple(
          fc.constant(students),
          fc.array(parentRecordArb, { minLength: 1, maxLength: 10 }),
          tenantIdArb,
          // Select a subset of student IDs as targets (may include cross-tenant)
          fc.subarray(
            students.map((s) => s.id),
            { minLength: 1 },
          ),
        ),
      );

    it('targeted resolution only includes recipients from the query tenant', () => {
      fc.assert(
        fc.property(targetedScenarioArb, ([students, parentRecords, queryTenantId, targetIds]) => {
          const parentMap = new Map<string, ParentRecord>();
          for (const p of parentRecords) {
            parentMap.set(p.id, p);
          }

          const recipients = resolveTargetedRecipients(
            students,
            parentMap,
            queryTenantId,
            targetIds,
          );

          // Every resolved recipient must have at least one active student
          // in the query tenant within the targeted set
          for (const parentId of recipients) {
            const hasValidStudentInTenant = students.some(
              (s) =>
                targetIds.includes(s.id) &&
                s.tenantId === queryTenantId &&
                s.status === 'aktif' &&
                s.orangTuaId === parentId,
            );
            expect(hasValidStudentInTenant).toBe(true);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('targeted students from other tenants are excluded from recipient resolution', () => {
      fc.assert(
        fc.property(targetedScenarioArb, ([students, parentRecords, queryTenantId, targetIds]) => {
          const parentMap = new Map<string, ParentRecord>();
          for (const p of parentRecords) {
            parentMap.set(p.id, p);
          }

          const recipients = resolveTargetedRecipients(
            students,
            parentMap,
            queryTenantId,
            targetIds,
          );

          // Find parents that are only linked via cross-tenant targeted students
          const crossTenantTargetStudents = students.filter(
            (s) => targetIds.includes(s.id) && s.tenantId !== queryTenantId,
          );

          for (const student of crossTenantTargetStudents) {
            if (student.orangTuaId === null) continue;

            // If this parent is in recipients, they must also be linked via
            // an in-tenant student in the target list
            if (recipients.includes(student.orangTuaId)) {
              const hasInTenantLink = students.some(
                (s) =>
                  targetIds.includes(s.id) &&
                  s.tenantId === queryTenantId &&
                  s.status === 'aktif' &&
                  s.orangTuaId === student.orangTuaId,
              );
              expect(hasInTenantLink).toBe(true);
            }
          }
        }),
        { numRuns: 200 },
      );
    });
  });
});
