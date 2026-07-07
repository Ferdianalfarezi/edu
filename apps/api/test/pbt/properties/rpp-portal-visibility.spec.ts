/**
 * Property 22: RPP Portal Visibility
 *
 * For any RPP query in the portal by any user, the system SHALL return only RPP records
 * with status `published` AND belonging to the same tenant. Draft RPP and RPP from other
 * tenants SHALL be excluded.
 *
 * Properties verified:
 * 1. Only RPP with status='published' appear in the portal listing (Req 43.1)
 * 2. Draft RPP are NEVER visible in the portal (Req 41.6)
 * 3. When an RPP is changed from published→draft, it disappears from the portal (Req 41.11)
 * 4. Published RPP from the same tenant are visible to all guru/kepala_sekolah/admin in that tenant
 *
 * **Validates: Requirements 41.6, 41.11, 43.1**
 *
 * This is a PURE logic property test — simulates the visibility filtering function
 * with arbitrary RPP records, roles, tenants, and status transitions. No DB or network dependencies.
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryUuid, RPP_STATUSES, type RppStatus } from '../arbitraries/common';

// ─── Domain Types ─────────────────────────────────────────────────────────────

interface RppRecord {
  id: string;
  tenant_id: string;
  guru_id: string;
  mata_pelajaran_id: string;
  kategori_id: string;
  judul: string;
  konten_type: 'richtext' | 'file';
  status: RppStatus;
  tahun_terbit: number;
  tanggal_publish: Date | null;
}

/** Roles that can access the RPP portal (Req 43.1, 43.5, 43.6) */
type PortalViewerRole = 'guru' | 'kepala_sekolah' | 'admin';

const PORTAL_VIEWER_ROLES: PortalViewerRole[] = ['guru', 'kepala_sekolah', 'admin'];

// ─── Pure Logic Under Test ────────────────────────────────────────────────────

/**
 * Filters RPP records visible in the portal for a given viewer.
 *
 * Requirements:
 * - 43.1: Portal shows only RPP with status='published' from the same tenant
 * - 41.6: Draft RPP are hidden from all users except the creator
 * - 41.11: RPP access is limited to the same tenant
 */
function filterRppForPortal(
  allRpp: RppRecord[],
  viewerTenantId: string,
  _viewerRole: PortalViewerRole,
): RppRecord[] {
  return allRpp.filter((rpp) => rpp.status === 'published' && rpp.tenant_id === viewerTenantId);
}

/**
 * Simulates publishing an RPP: sets status to 'published' and records publish date.
 * After publishing, the RPP becomes visible in the portal (Req 41.5, 41.7).
 */
function publishRpp(rpp: RppRecord): RppRecord {
  return {
    ...rpp,
    status: 'published',
    tanggal_publish: new Date(),
  };
}

/**
 * Simulates reverting an RPP from published to draft.
 * After revert, the RPP is no longer visible in the portal (Req 41.11, 42.3).
 */
function revertRppToDraft(rpp: RppRecord): RppRecord {
  return {
    ...rpp,
    status: 'draft',
    // tanggal_publish preserved for history, but status controls visibility
  };
}

// ─── Arbitrary Generators ─────────────────────────────────────────────────────

function arbitraryRpp(overrides?: Partial<RppRecord>): fc.Arbitrary<RppRecord> {
  return fc.record({
    id: overrides?.id ? fc.constant(overrides.id) : arbitraryUuid(),
    tenant_id: overrides?.tenant_id ? fc.constant(overrides.tenant_id) : arbitraryUuid(),
    guru_id: overrides?.guru_id ? fc.constant(overrides.guru_id) : arbitraryUuid(),
    mata_pelajaran_id: overrides?.mata_pelajaran_id
      ? fc.constant(overrides.mata_pelajaran_id)
      : arbitraryUuid(),
    kategori_id: overrides?.kategori_id ? fc.constant(overrides.kategori_id) : arbitraryUuid(),
    judul: fc.string({ minLength: 1, maxLength: 100 }),
    konten_type: fc.constantFrom('richtext' as const, 'file' as const),
    status: overrides?.status ? fc.constant(overrides.status) : fc.constantFrom(...RPP_STATUSES),
    tahun_terbit: fc.integer({ min: 2020, max: 2030 }),
    tanggal_publish:
      overrides?.status === 'published'
        ? fc.date().map((d) => d)
        : fc.option(fc.date(), { nil: null }),
  });
}

function arbitraryRppList(
  minLength = 1,
  maxLength = 10,
  overrides?: Partial<RppRecord>,
): fc.Arbitrary<RppRecord[]> {
  return fc.array(arbitraryRpp(overrides), { minLength, maxLength });
}

function arbitraryPortalViewerRole(): fc.Arbitrary<PortalViewerRole> {
  return fc.constantFrom(...PORTAL_VIEWER_ROLES);
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 22: RPP Portal Visibility', () => {
  describe('Requirement 43.1: Only published RPP from same tenant appear in portal', () => {
    it('portal only returns RPP with status=published from the viewer tenant', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // viewer's tenant
          arbitraryRppList(1, 15), // mixed RPP records (different tenants and statuses)
          arbitraryPortalViewerRole(),
          (viewerTenantId, allRpp, role) => {
            const visible = filterRppForPortal(allRpp, viewerTenantId, role);

            // PROPERTY: every visible RPP must be published AND same tenant
            return visible.every(
              (rpp) => rpp.status === 'published' && rpp.tenant_id === viewerTenantId,
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('all published RPP from viewer tenant are included (no false exclusions)', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // viewer's tenant
          arbitraryRppList(1, 10, { status: 'published' }), // all published
          arbitraryPortalViewerRole(),
          (viewerTenantId, publishedRpp, role) => {
            // Force all RPP to be from the viewer's tenant
            const sameTenantRpp = publishedRpp.map((rpp) => ({
              ...rpp,
              tenant_id: viewerTenantId,
            }));

            const visible = filterRppForPortal(sameTenantRpp, viewerTenantId, role);

            // PROPERTY: all published RPP from same tenant must be visible
            return visible.length === sameTenantRpp.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('RPP from other tenants are never visible regardless of status', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // viewer's tenant
          arbitraryUuid(), // other tenant
          arbitraryRppList(1, 10, { status: 'published' }),
          arbitraryPortalViewerRole(),
          (viewerTenantId, otherTenantId, rppList, role) => {
            // Skip if tenants happen to be the same (extremely unlikely with UUIDs)
            if (viewerTenantId === otherTenantId) return true;

            // All RPP belong to a different tenant
            const otherTenantRpp = rppList.map((rpp) => ({
              ...rpp,
              tenant_id: otherTenantId,
            }));

            const visible = filterRppForPortal(otherTenantRpp, viewerTenantId, role);

            // PROPERTY: RPP from other tenants are NEVER visible
            return visible.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Requirement 41.6: Draft RPP are NEVER visible in the portal', () => {
    it('draft RPP are never included in portal results', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // viewer's tenant
          arbitraryRppList(1, 10, { status: 'draft' }),
          arbitraryPortalViewerRole(),
          (viewerTenantId, draftRpp, role) => {
            // Force all to same tenant so only status filters them
            const sameTenantDrafts = draftRpp.map((rpp) => ({
              ...rpp,
              tenant_id: viewerTenantId,
            }));

            const visible = filterRppForPortal(sameTenantDrafts, viewerTenantId, role);

            // PROPERTY: draft RPP are NEVER visible in the portal
            return visible.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('in a mixed list, no draft RPP ever appears in portal results', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // viewer's tenant
          arbitraryRppList(2, 20),
          arbitraryPortalViewerRole(),
          (viewerTenantId, mixedRpp, role) => {
            const visible = filterRppForPortal(mixedRpp, viewerTenantId, role);

            // PROPERTY: none of the visible RPP have draft status
            return visible.every((rpp) => rpp.status !== 'draft');
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Requirement 41.11: Published→draft transition hides RPP from portal', () => {
    it('when an RPP is reverted from published to draft, it disappears from portal', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenant
          arbitraryRpp({ status: 'draft' }), // start as draft
          arbitraryPortalViewerRole(),
          (tenantId, draftRpp, role) => {
            const rppInTenant = { ...draftRpp, tenant_id: tenantId };

            // Step 1: Publish the RPP
            const published = publishRpp(rppInTenant);

            // Verify it's visible after publishing
            const visibleAfterPublish = filterRppForPortal([published], tenantId, role);
            if (visibleAfterPublish.length !== 1) return false;

            // Step 2: Revert to draft
            const reverted = revertRppToDraft(published);

            // PROPERTY: after revert to draft, RPP disappears from portal
            const visibleAfterRevert = filterRppForPortal([reverted], tenantId, role);
            return visibleAfterRevert.length === 0;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('revert only hides the reverted RPP; other published RPP remain visible', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenant
          arbitraryRpp({ status: 'published' }), // RPP to revert
          arbitraryRppList(1, 5, { status: 'published' }), // other published RPP
          arbitraryPortalViewerRole(),
          (tenantId, rppToRevert, otherPublished, role) => {
            // Force all into same tenant
            const rppInTenant = { ...rppToRevert, tenant_id: tenantId };
            const othersInTenant = otherPublished.map((r) => ({ ...r, tenant_id: tenantId }));

            const allBefore = [rppInTenant, ...othersInTenant];
            const visibleBefore = filterRppForPortal(allBefore, tenantId, role);
            if (visibleBefore.length !== allBefore.length) return false;

            // Revert the target RPP
            const reverted = revertRppToDraft(rppInTenant);
            const allAfter = [reverted, ...othersInTenant];
            const visibleAfter = filterRppForPortal(allAfter, tenantId, role);

            // PROPERTY: only the reverted RPP disappears; others remain
            return visibleAfter.length === othersInTenant.length;
          },
        ),
        PBT_CONFIG,
      );
    });

    it('full lifecycle: draft→published→draft→published toggles portal visibility correctly', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenant
          arbitraryRpp({ status: 'draft' }),
          arbitraryPortalViewerRole(),
          fc.integer({ min: 1, max: 4 }), // cycles
          (tenantId, draftRpp, role, cycles) => {
            let currentRpp = { ...draftRpp, tenant_id: tenantId };

            for (let i = 0; i < cycles; i++) {
              // Publish: should become visible
              currentRpp = publishRpp(currentRpp);
              const afterPublish = filterRppForPortal([currentRpp], tenantId, role);
              if (afterPublish.length !== 1) return false;

              // Revert to draft: should become invisible
              currentRpp = revertRppToDraft(currentRpp);
              const afterRevert = filterRppForPortal([currentRpp], tenantId, role);
              if (afterRevert.length !== 0) return false;
            }

            // Final publish — should be visible
            currentRpp = publishRpp(currentRpp);
            const finalVisibility = filterRppForPortal([currentRpp], tenantId, role);
            return finalVisibility.length === 1;
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Published RPP visible to all portal roles in same tenant', () => {
    it('guru, kepala_sekolah, and admin all see the same published RPP', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenant
          arbitraryRppList(1, 10, { status: 'published' }),
          (tenantId, publishedRpp) => {
            const sameTenantRpp = publishedRpp.map((rpp) => ({
              ...rpp,
              tenant_id: tenantId,
            }));

            const visibleToGuru = filterRppForPortal(sameTenantRpp, tenantId, 'guru');
            const visibleToKepsek = filterRppForPortal(sameTenantRpp, tenantId, 'kepala_sekolah');
            const visibleToAdmin = filterRppForPortal(sameTenantRpp, tenantId, 'admin');

            // PROPERTY: all three roles see the exact same set of published RPP
            return (
              visibleToGuru.length === sameTenantRpp.length &&
              visibleToKepsek.length === sameTenantRpp.length &&
              visibleToAdmin.length === sameTenantRpp.length
            );
          },
        ),
        PBT_CONFIG,
      );
    });

    it('portal visibility is role-independent for all portal roles', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // tenant
          arbitraryRppList(2, 15), // mixed status RPP
          (tenantId, mixedRpp) => {
            const visibleToGuru = filterRppForPortal(mixedRpp, tenantId, 'guru');
            const visibleToKepsek = filterRppForPortal(mixedRpp, tenantId, 'kepala_sekolah');
            const visibleToAdmin = filterRppForPortal(mixedRpp, tenantId, 'admin');

            // PROPERTY: all roles get identical results — portal visibility
            // is determined only by status and tenant, not by role
            const guruIds = visibleToGuru.map((r) => r.id).sort();
            const kepsekIds = visibleToKepsek.map((r) => r.id).sort();
            const adminIds = visibleToAdmin.map((r) => r.id).sort();

            return (
              JSON.stringify(guruIds) === JSON.stringify(kepsekIds) &&
              JSON.stringify(kepsekIds) === JSON.stringify(adminIds)
            );
          },
        ),
        PBT_CONFIG,
      );
    });
  });

  describe('Visible count invariant', () => {
    it('portal visible count equals published RPP count in same tenant', () => {
      fc.assert(
        fc.property(
          arbitraryUuid(), // viewer's tenant
          arbitraryRppList(1, 20),
          arbitraryPortalViewerRole(),
          (viewerTenantId, allRpp, role) => {
            const visible = filterRppForPortal(allRpp, viewerTenantId, role);
            const expectedCount = allRpp.filter(
              (rpp) => rpp.status === 'published' && rpp.tenant_id === viewerTenantId,
            ).length;

            // PROPERTY: visible count must exactly match published + same-tenant count
            return visible.length === expectedCount;
          },
        ),
        PBT_CONFIG,
      );
    });
  });
});
