/**
 * Shared fast-check arbitraries (generators) for property-based tests.
 *
 * These generators produce valid domain objects for the edu school management system.
 * They are used across all PBT test suites to ensure consistent test data generation.
 */

export * from './common';
export * from './tenant';
export * from './user';
export * from './siswa';
export * from './kelas';
export * from './tahun-ajaran';
export * from './mata-pelajaran';
export * from './absensi';
export * from './tagihan';
