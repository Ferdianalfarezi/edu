/**
 * System user roles.
 * Each user has exactly one role per tenant context.
 */
export enum Role {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  KEPALA_SEKOLAH = 'kepala_sekolah',
  GURU = 'guru',
  BENDAHARA = 'bendahara',
  ORANG_TUA = 'orang_tua',
}

/**
 * Roles that authenticate with email + password (staff roles).
 */
export const STAFF_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.KEPALA_SEKOLAH,
  Role.GURU,
  Role.BENDAHARA,
] as const;

/**
 * Roles that authenticate with phone number only.
 */
export const PHONE_AUTH_ROLES = [Role.ORANG_TUA] as const;

/**
 * Roles that have access to the Admin Panel (web).
 */
export const ADMIN_PANEL_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.KEPALA_SEKOLAH,
  Role.GURU,
  Role.BENDAHARA,
] as const;

/**
 * Roles that have access to the Mobile App.
 */
export const MOBILE_APP_ROLES = [Role.GURU, Role.ORANG_TUA] as const;
