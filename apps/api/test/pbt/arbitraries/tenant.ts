import fc from 'fast-check';
import { arbitraryUuid, arbitraryName, arbitraryPhoneNumber } from './common';

// ─── Tenant Types ─────────────────────────────────────────────────────────────

export interface TenantData {
  id: string;
  nama: string;
  alamat: string;
  telepon: string;
  is_active: boolean;
}

// ─── Tenant Arbitraries ───────────────────────────────────────────────────────

/**
 * Generates a valid tenant (school).
 */
export function arbitraryTenant(): fc.Arbitrary<TenantData> {
  return fc.record({
    id: arbitraryUuid(),
    nama: fc.constantFrom(
      'SD Negeri 1 Jakarta',
      'SMP Islam Terpadu',
      'SMA Harapan Bangsa',
      'MI Al-Falah',
      'SD Kristen Pelita',
      'SMP Negeri 5 Bandung',
      'SMA Muhammadiyah 2',
      'SD Bina Nusantara',
    ),
    alamat: fc.constantFrom(
      'Jl. Merdeka No. 1, Jakarta Pusat',
      'Jl. Sudirman No. 45, Bandung',
      'Jl. Diponegoro No. 12, Surabaya',
      'Jl. Gatot Subroto No. 8, Semarang',
    ),
    telepon: arbitraryPhoneNumber(),
    is_active: fc.boolean(),
  });
}

/**
 * Generates a tenant ID that differs from a given tenant ID.
 * Useful for testing tenant isolation.
 */
export function arbitraryOtherTenantId(excludeId: string): fc.Arbitrary<string> {
  return arbitraryUuid().filter((id) => id !== excludeId);
}

/**
 * Generates a pair of distinct tenant IDs.
 * Useful for testing cross-tenant isolation (Property 1).
 */
export function arbitraryTenantPair(): fc.Arbitrary<{ tenantA: string; tenantB: string }> {
  return fc
    .tuple(arbitraryUuid(), arbitraryUuid())
    .filter(([a, b]) => a !== b)
    .map(([tenantA, tenantB]) => ({ tenantA, tenantB }));
}
