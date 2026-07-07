import fc from 'fast-check';
import {
  arbitraryUuid,
  arbitraryEmail,
  arbitraryName,
  arbitraryPhoneNumber,
  arbitraryRole,
  arbitraryStaffRole,
  type Role,
  type StaffRole,
} from './common';

// ─── User Types ───────────────────────────────────────────────────────────────

export interface UserData {
  id: string;
  tenant_id: string | null;
  nama: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
}

export interface StaffUserData extends UserData {
  tenant_id: string;
  email: string;
  role: StaffRole;
}

export interface ParentUserData extends UserData {
  tenant_id: null;
  phone: string;
  role: 'orang_tua';
}

// ─── User Arbitraries ─────────────────────────────────────────────────────────

/**
 * Generates a valid staff user (admin, kepala_sekolah, bendahara, guru).
 * Staff users have email+password auth and belong to a single tenant.
 */
export function arbitraryStaffUser(tenantId?: string): fc.Arbitrary<StaffUserData> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    nama: arbitraryName(),
    email: arbitraryEmail(),
    phone: fc.constant(null),
    role: arbitraryStaffRole(),
    is_active: fc.constant(true),
  }) as fc.Arbitrary<StaffUserData>;
}

/**
 * Generates a valid parent user (orang_tua).
 * Parent users have phone-only auth and NULL tenant_id (cross-tenant per ADR-002).
 */
export function arbitraryParentUser(): fc.Arbitrary<ParentUserData> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: fc.constant(null),
    nama: arbitraryName(),
    email: fc.constant(null),
    phone: arbitraryPhoneNumber(),
    role: fc.constant('orang_tua' as const),
    is_active: fc.constant(true),
  }) as fc.Arbitrary<ParentUserData>;
}

/**
 * Generates a guru (teacher) user for a specific tenant.
 */
export function arbitraryGuru(tenantId?: string): fc.Arbitrary<StaffUserData> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    nama: arbitraryName(),
    email: arbitraryEmail(),
    phone: fc.constant(null),
    role: fc.constant('guru' as const),
    is_active: fc.constant(true),
  }) as fc.Arbitrary<StaffUserData>;
}

/**
 * Generates a kepala sekolah (principal) user for a specific tenant.
 */
export function arbitraryKepalaSekolah(tenantId?: string): fc.Arbitrary<StaffUserData> {
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    nama: arbitraryName(),
    email: arbitraryEmail(),
    phone: fc.constant(null),
    role: fc.constant('kepala_sekolah' as const),
    is_active: fc.constant(true),
  }) as fc.Arbitrary<StaffUserData>;
}

/**
 * Generates a user with a specific role in a specific tenant.
 */
export function arbitraryUserWithRole(role: Role, tenantId?: string): fc.Arbitrary<UserData> {
  if (role === 'orang_tua') {
    return arbitraryParentUser();
  }
  if (role === 'super_admin') {
    return fc.record({
      id: arbitraryUuid(),
      tenant_id: fc.constant(null),
      nama: arbitraryName(),
      email: arbitraryEmail(),
      phone: fc.constant(null),
      role: fc.constant('super_admin' as const),
      is_active: fc.constant(true),
    });
  }
  return fc.record({
    id: arbitraryUuid(),
    tenant_id: tenantId ? fc.constant(tenantId) : arbitraryUuid(),
    nama: arbitraryName(),
    email: arbitraryEmail(),
    phone: fc.constant(null),
    role: fc.constant(role),
    is_active: fc.constant(true),
  });
}
