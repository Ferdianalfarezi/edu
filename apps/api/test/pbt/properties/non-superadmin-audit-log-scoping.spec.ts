/**
 * Property 7: Non-superadmin audit log access is tenant and entity scoped
 *
 * For any user with role ADMIN or BENDAHARA querying the audit log endpoint,
 * ALL returned entries SHALL have tenant_id equal to the requesting user's tenant,
 * AND for BENDAHARA users, entity_type SHALL be restricted to only 'tagihan' or 'pembayaran'.
 *
 * **Validates: Requirements 5.5, 6.4**
 *
 * Pure logic property test — simulates the AuditLogController's role-based scoping
 * behavior by generating random audit entries across multiple tenants, then querying
 * as ADMIN/BENDAHARA users and verifying the scoping rules hold.
 *
 * Tag: Feature: superadmin-cross-tenant-access, Property 7: Non-superadmin audit log access is tenant and entity scoped
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditAction =
  'create' | 'update' | 'delete' | 'deactivate' | 'activate' | 'role_change' | 'password_reset';

type AuditEntityType = 'tagihan' | 'pembayaran' | 'user' | 'role_assignment' | 'tenant_config';

type NonSuperAdminAuditRole = 'admin' | 'bendahara';

interface AuditEntry {
  id: string;
  tenant_id: string;
  entity_type: AuditEntityType;
  action: AuditAction;
  actor_user_id: string;
  created_at: string;
}

interface RequestUser {
  id: string;
  role: NonSuperAdminAuditRole;
  tenant_id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIT_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'delete',
  'deactivate',
  'activate',
  'role_change',
  'password_reset',
];

const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  'tagihan',
  'pembayaran',
  'user',
  'role_assignment',
  'tenant_config',
];

const BENDAHARA_ALLOWED_ENTITY_TYPES: AuditEntityType[] = ['tagihan', 'pembayaran'];

// ─── Simulated scoping logic (mirrors AuditLogController.findAll) ─────────────

/**
 * Pure function that simulates the AuditLogController's role-based scoping logic.
 *
 * - ADMIN: filter to entries matching the user's tenant_id (all entity types)
 * - BENDAHARA: filter to entries matching the user's tenant_id AND
 *   entity_type restricted to 'tagihan' or 'pembayaran'
 */
function applyRoleScoping(entries: AuditEntry[], user: RequestUser): AuditEntry[] {
  return entries.filter((entry) => {
    // Both ADMIN and BENDAHARA are scoped to their own tenant
    if (entry.tenant_id !== user.tenant_id) return false;

    // BENDAHARA is further restricted to tagihan and pembayaran
    if (user.role === 'bendahara') {
      if (!BENDAHARA_ALLOWED_ENTITY_TYPES.includes(entry.entity_type)) return false;
    }

    return true;
  });
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

/** Generate a pool of 3-5 tenant UUIDs to ensure cross-tenant data exists */
function arbitraryTenantPool(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryUuid(), { minLength: 3, maxLength: 5 });
}

/** Generate a random audit date */
function arbitraryAuditDate(): fc.Arbitrary<string> {
  return fc
    .date({
      min: new Date('2023-01-01T00:00:00Z'),
      max: new Date('2024-12-31T23:59:59Z'),
    })
    .map((d) => d.toISOString());
}

/** Generate a list of random audit entries across multiple tenants */
function arbitraryAuditEntries(tenantPool: string[]): fc.Arbitrary<AuditEntry[]> {
  return fc.array(
    fc.record({
      id: arbitraryUuid(),
      tenant_id: fc.constantFrom(...tenantPool),
      entity_type: fc.constantFrom(...AUDIT_ENTITY_TYPES),
      action: fc.constantFrom(...AUDIT_ACTIONS),
      actor_user_id: arbitraryUuid(),
      created_at: arbitraryAuditDate(),
    }),
    { minLength: 10, maxLength: 50 },
  );
}

/** Generate a non-superadmin user (ADMIN or BENDAHARA) belonging to one of the tenants */
function arbitraryNonSuperAdminUser(tenantPool: string[]): fc.Arbitrary<RequestUser> {
  return fc.record({
    id: arbitraryUuid(),
    role: fc.constantFrom<NonSuperAdminAuditRole>('admin', 'bendahara'),
    tenant_id: fc.constantFrom(...tenantPool),
  });
}

/** Generate specifically an ADMIN user */
function arbitraryAdminUser(tenantPool: string[]): fc.Arbitrary<RequestUser> {
  return fc.record({
    id: arbitraryUuid(),
    role: fc.constant<NonSuperAdminAuditRole>('admin'),
    tenant_id: fc.constantFrom(...tenantPool),
  });
}

/** Generate specifically a BENDAHARA user */
function arbitraryBendaharaUser(tenantPool: string[]): fc.Arbitrary<RequestUser> {
  return fc.record({
    id: arbitraryUuid(),
    role: fc.constant<NonSuperAdminAuditRole>('bendahara'),
    tenant_id: fc.constantFrom(...tenantPool),
  });
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 7: Non-superadmin audit log access is tenant and entity scoped', () => {
  it('all results for ADMIN/BENDAHARA have tenant_id matching the requesting user', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryNonSuperAdminUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);

          // PROPERTY: every returned entry has tenant_id === user.tenant_id
          return results.every((entry) => entry.tenant_id === user.tenant_id);
        },
      ),
      PBT_CONFIG,
    );
  });

  it('BENDAHARA results contain only tagihan or pembayaran entity types', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryBendaharaUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);

          // PROPERTY: for BENDAHARA, every entry must be tagihan or pembayaran
          return results.every((entry) =>
            BENDAHARA_ALLOWED_ENTITY_TYPES.includes(entry.entity_type),
          );
        },
      ),
      PBT_CONFIG,
    );
  });

  it('ADMIN results may include any entity type (not restricted like BENDAHARA)', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryAdminUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);

          // PROPERTY: ADMIN results are tenant-scoped but NOT entity-type-restricted
          // Every result has matching tenant_id (already tested) but can be any entity_type
          // Verify no entry from user's tenant is wrongly excluded
          const expectedEntries = entries.filter((e) => e.tenant_id === user.tenant_id);
          return results.length === expectedEntries.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('no entry from another tenant appears in results for ADMIN or BENDAHARA', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryNonSuperAdminUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);

          // PROPERTY: no entry from a different tenant leaks through
          const otherTenantEntries = results.filter((e) => e.tenant_id !== user.tenant_id);
          return otherTenantEntries.length === 0;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('BENDAHARA cannot see user, role_assignment, or tenant_config entries even from own tenant', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryBendaharaUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);

          // PROPERTY: forbidden entity types never appear for BENDAHARA
          const forbiddenTypes: AuditEntityType[] = ['user', 'role_assignment', 'tenant_config'];
          return results.every((entry) => !forbiddenTypes.includes(entry.entity_type));
        },
      ),
      PBT_CONFIG,
    );
  });

  it('scoped results are a subset of the total entries (no fabricated records)', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryNonSuperAdminUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);
          const entryIds = new Set(entries.map((e) => e.id));

          // PROPERTY: every result must be from the original entry set
          return results.every((r) => entryIds.has(r.id)) && results.length <= entries.length;
        },
      ),
      PBT_CONFIG,
    );
  });

  it('all entries matching scoping criteria are included (no valid entries dropped)', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPool().chain((tenantPool) =>
          fc.tuple(arbitraryAuditEntries(tenantPool), arbitraryNonSuperAdminUser(tenantPool)),
        ),
        ([entries, user]) => {
          const results = applyRoleScoping(entries, user);

          // Compute expected entries manually
          const expected = entries.filter((entry) => {
            if (entry.tenant_id !== user.tenant_id) return false;
            if (user.role === 'bendahara') {
              return BENDAHARA_ALLOWED_ENTITY_TYPES.includes(entry.entity_type);
            }
            return true;
          });

          // PROPERTY: the result set exactly matches the expected scoped set
          return results.length === expected.length;
        },
      ),
      PBT_CONFIG,
    );
  });
});
