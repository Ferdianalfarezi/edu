import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * User roles — matches CHECK constraint in design SQL.
 */
export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'admin',
  'kepala_sekolah',
  'guru',
  'bendahara',
  'orang_tua',
]);

/**
 * Tahun ajaran status — matches CHECK constraint in design SQL.
 */
export const tahunAjaranStatusEnum = pgEnum('tahun_ajaran_status', [
  'disiapkan',
  'aktif',
  'nonaktif',
]);

/**
 * Siswa status — matches CHECK constraint in design SQL.
 */
export const siswaStatusEnum = pgEnum('siswa_status', [
  'aktif',
  'pindah_sekolah',
  'keluar',
  'lulus',
]);

/**
 * Jenis kelamin — matches CHECK constraint in design SQL.
 */
export const jenisKelaminEnum = pgEnum('jenis_kelamin', ['L', 'P']);
