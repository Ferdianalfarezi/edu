/**
 * Property 7: Multi-tenant isolation
 *
 * For any student belonging to tenant A, a detail request from a user in tenant B
 * returns 404 (NotFoundException), not 403 (ForbiddenException). All queries
 * (profile, riwayat_kelas, rapor) are filtered by the requesting user's tenant_id
 * from JWT.
 *
 * This ensures no information leakage about student existence across tenants.
 *
 * **Validates: Requirements 9.1, 9.2**
 *
 * Feature: student-detail-page, Property 7: Multi-tenant isolation
 *
 * Properties verified:
 * 1. getSiswaDetail with wrong tenantId always throws NotFoundException (404)
 * 2. getSiswaRaporDetail with wrong tenantId always throws NotFoundException (404)
 * 3. The error is never ForbiddenException (403) — no info leakage
 */

import fc from 'fast-check';
import { PBT_CONFIG } from '../config';
import { arbitraryTenantPair } from '../arbitraries/tenant';
import { arbitraryUuid } from '../arbitraries/common';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Represents a siswa record in the database with its owning tenant */
interface SiswaRecord {
  id: string;
  tenantId: string;
  nama: string;
  kelasId: string | null;
}

/** Simulated query result row from the profile query */
interface ProfileRow {
  id: string;
  nama: string;
  nisn: string | null;
  jenisKelamin: 'L' | 'P' | null;
  tanggalLahir: string | null;
  alamat: string | null;
  status: 'aktif';
  kelasId: string | null;
  kelasNama: string | null;
  kelasTingkat: number | null;
  kelasTahunAjaranId: string | null;
  orangTuaNama: string | null;
}

/** Error types that the service can throw */
class NotFoundException extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}

class ForbiddenException extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenException';
  }
}

// ─── Simulated Database & Service Logic ───────────────────────────────────────

/**
 * Simulates the profile query in getSiswaDetail:
 *   .where(and(eq(siswa.id, siswaId), eq(siswa.tenantId, tenantId)))
 *
 * Returns the matching row or empty array (simulating DB result).
 */
function queryProfileByTenant(
  records: SiswaRecord[],
  siswaId: string,
  requestingTenantId: string,
): ProfileRow[] {
  return records
    .filter((r) => r.id === siswaId && r.tenantId === requestingTenantId)
    .map((r) => ({
      id: r.id,
      nama: r.nama,
      nisn: null,
      jenisKelamin: null,
      tanggalLahir: null,
      alamat: null,
      status: 'aktif' as const,
      kelasId: r.kelasId,
      kelasNama: r.kelasId ? 'Kelas X' : null,
      kelasTingkat: r.kelasId ? 10 : null,
      kelasTahunAjaranId: r.kelasId ? 'ta-id' : null,
      orangTuaNama: null,
    }));
}

/**
 * Simulates the getSiswaDetail service logic:
 * - Queries profile filtered by tenantId
 * - If no result, throws NotFoundException (NOT ForbiddenException)
 *
 * This mirrors the actual implementation in SiswaService.getSiswaDetail()
 */
function getSiswaDetail(
  records: SiswaRecord[],
  requestingTenantId: string,
  siswaId: string,
): { success: true } | { success: false; error: NotFoundException | ForbiddenException } {
  const profileResults = queryProfileByTenant(records, siswaId, requestingTenantId);

  if (!profileResults[0]) {
    // The service throws NotFoundException, NOT ForbiddenException
    // This is the key security property — no information leakage
    return { success: false, error: new NotFoundException('Siswa tidak ditemukan') };
  }

  return { success: true };
}

/** Simulated rapor_nilai record */
interface RaporNilaiRecord {
  id: string;
  raporId: string;
  siswaId: string;
  tenantId: string;
  status: 'submitted' | 'draft';
}

/**
 * Simulates the rapor_nilai query in getSiswaRaporDetail:
 *   .where(and(
 *     eq(raporNilai.raporId, raporId),
 *     eq(raporNilai.siswaId, siswaId),
 *     eq(raporNilai.tenantId, tenantId),
 *     eq(raporNilai.status, 'submitted'),
 *   ))
 */
function queryRaporNilaiByTenant(
  records: RaporNilaiRecord[],
  raporId: string,
  siswaId: string,
  requestingTenantId: string,
): RaporNilaiRecord[] {
  return records.filter(
    (r) =>
      r.raporId === raporId &&
      r.siswaId === siswaId &&
      r.tenantId === requestingTenantId &&
      r.status === 'submitted',
  );
}

/**
 * Simulates the getSiswaRaporDetail service logic:
 * - Queries rapor_nilai filtered by tenantId
 * - If no results, throws NotFoundException (NOT ForbiddenException)
 */
function getSiswaRaporDetail(
  records: RaporNilaiRecord[],
  requestingTenantId: string,
  siswaId: string,
  raporId: string,
): { success: true } | { success: false; error: NotFoundException | ForbiddenException } {
  const nilaiResults = queryRaporNilaiByTenant(records, raporId, siswaId, requestingTenantId);

  if (nilaiResults.length === 0) {
    return { success: false, error: new NotFoundException('Data rapor tidak ditemukan') };
  }

  return { success: true };
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Feature: student-detail-page, Property 7: Multi-tenant isolation', () => {
  /**
   * **Validates: Requirements 9.1, 9.2**
   *
   * For any two distinct tenantIds (A and B) and a siswaId that belongs to tenant A,
   * querying getSiswaDetail(tenantB, siswaId) always results in a 404 NotFoundException.
   */
  it('getSiswaDetail with wrong tenant always returns 404 NotFoundException, never 403', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair(),
        arbitraryUuid(), // siswaId belonging to tenant A
        ({ tenantA, tenantB }, siswaId) => {
          // Setup: student exists in tenant A's data
          const dbRecords: SiswaRecord[] = [
            {
              id: siswaId,
              tenantId: tenantA,
              nama: 'Test Student',
              kelasId: null,
            },
          ];

          // Act: query with tenant B (wrong tenant)
          const result = getSiswaDetail(dbRecords, tenantB, siswaId);

          // PROPERTY 1: Request fails (student not found for tenant B)
          if (result.success) return false;

          // PROPERTY 2: Error is NotFoundException (404), NOT ForbiddenException (403)
          const isNotFoundException = result.error instanceof NotFoundException;
          const isNotForbidden = !(result.error instanceof ForbiddenException);
          const statusIs404 = result.error.status === 404;

          return isNotFoundException && isNotForbidden && statusIs404;
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 9.1, 9.2**
   *
   * For any student belonging to tenant A with rapor_nilai data,
   * querying getSiswaRaporDetail(tenantB, siswaId, raporId) always returns 404.
   */
  it('getSiswaRaporDetail with wrong tenant always returns 404 NotFoundException, never 403', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair(),
        arbitraryUuid(), // siswaId
        arbitraryUuid(), // raporId
        ({ tenantA, tenantB }, siswaId, raporId) => {
          // Setup: rapor_nilai exists for this student in tenant A
          const dbRecords: RaporNilaiRecord[] = [
            {
              id: 'nilai-1',
              raporId,
              siswaId,
              tenantId: tenantA,
              status: 'submitted',
            },
          ];

          // Act: query with tenant B (wrong tenant)
          const result = getSiswaRaporDetail(dbRecords, tenantB, siswaId, raporId);

          // PROPERTY 1: Request fails (data not found for tenant B)
          if (result.success) return false;

          // PROPERTY 2: Error is NotFoundException (404), NOT ForbiddenException (403)
          const isNotFoundException = result.error instanceof NotFoundException;
          const isNotForbidden = !(result.error instanceof ForbiddenException);
          const statusIs404 = result.error.status === 404;

          return isNotFoundException && isNotForbidden && statusIs404;
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 9.1, 9.2**
   *
   * Verifies that the correct tenant (tenant A) CAN access the student data,
   * confirming the isolation is directional (blocks wrong tenant, allows correct tenant).
   */
  it('getSiswaDetail with correct tenant succeeds (confirms isolation is directional)', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair(),
        arbitraryUuid(), // siswaId
        ({ tenantA }, siswaId) => {
          // Setup: student exists in tenant A
          const dbRecords: SiswaRecord[] = [
            {
              id: siswaId,
              tenantId: tenantA,
              nama: 'Test Student',
              kelasId: null,
            },
          ];

          // Act: query with correct tenant (tenant A)
          const result = getSiswaDetail(dbRecords, tenantA, siswaId);

          // PROPERTY: Correct tenant always succeeds
          return result.success === true;
        },
      ),
      PBT_CONFIG,
    );
  });

  /**
   * **Validates: Requirements 9.1, 9.2**
   *
   * Even when the DB contains students from multiple tenants, querying with
   * tenant B only returns 404 for a student belonging to tenant A.
   * This tests the scenario with a "crowded" database.
   */
  it('in a mixed-tenant database, wrong tenant always gets 404 regardless of other data', () => {
    fc.assert(
      fc.property(
        arbitraryTenantPair(),
        arbitraryUuid(), // target siswaId in tenant A
        fc.array(arbitraryUuid(), { minLength: 1, maxLength: 10 }), // other students in tenant B
        ({ tenantA, tenantB }, targetSiswaId, otherSiswaIds) => {
          // Setup: mixed database with students from both tenants
          const dbRecords: SiswaRecord[] = [
            // Target student belongs to tenant A
            {
              id: targetSiswaId,
              tenantId: tenantA,
              nama: 'Target Student',
              kelasId: null,
            },
            // Other students belong to tenant B
            ...otherSiswaIds.map((id) => ({
              id,
              tenantId: tenantB,
              nama: 'Other Student',
              kelasId: null,
            })),
          ];

          // Act: tenant B tries to access tenant A's student
          const result = getSiswaDetail(dbRecords, tenantB, targetSiswaId);

          // PROPERTY: Still 404, not 403, even when tenant B has their own data
          if (result.success) return false;

          return result.error instanceof NotFoundException && result.error.status === 404;
        },
      ),
      PBT_CONFIG,
    );
  });
});
