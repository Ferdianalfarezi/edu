import { pgTable, uuid, varchar, date, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenant } from './tenant';
import { siswa } from './siswa';
import { kelas } from './kelas';
import { tahunAjaran } from './tahun-ajaran';

/**
 * Tabel konfigurasi_sekolah — key-value config store per tenant.
 * Stores school-specific settings: threshold alpa, nominal SPP per tingkat,
 * tanggal jatuh tempo, logo, etc.
 *
 * Requirements: 22.1, 22.5
 * - Each tenant can have multiple config keys
 * - UNIQUE(tenant_id, key): one value per key per school
 * - Value stored as JSONB for flexibility (numbers, strings, objects)
 */
export const konfigurasiSekolah = pgTable(
  'konfigurasi_sekolah',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    key: varchar('key', { length: 100 }).notNull(),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueTenantKey: unique('uq_konfigurasi_sekolah_tenant_key').on(table.tenantId, table.key),
  }),
);

/**
 * Tabel hari_libur — holiday calendar per tenant.
 * Used by attendance module to warn about holidays and exclude from
 * total_hari_efektif calculation.
 *
 * Requirements: 22.5 (holiday config), 1.13, 1.14 (hari libur in attendance)
 * - UNIQUE(tenant_id, tanggal): one entry per date per school
 * - keterangan: description of the holiday (e.g. "Hari Kemerdekaan")
 */
export const hariLibur = pgTable(
  'hari_libur',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    tanggal: date('tanggal').notNull(),
    keterangan: varchar('keterangan', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueTenantTanggal: unique('uq_hari_libur_tenant_tanggal').on(table.tenantId, table.tanggal),
  }),
);

/**
 * Tabel riwayat_kelas — class history for student promotion tracking.
 * Records which class a student was in for each academic year.
 * Used by kenaikan kelas module to track promotion history.
 *
 * Requirements: 30.5 (kenaikan kelas history)
 * - Links siswa to their kelas for a given tahun_ajaran
 * - Append-only: no updated_at (historical record)
 */
export const riwayatKelas = pgTable('riwayat_kelas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  siswaId: uuid('siswa_id')
    .notNull()
    .references(() => siswa.id),
  kelasId: uuid('kelas_id')
    .notNull()
    .references(() => kelas.id),
  tahunAjaranId: uuid('tahun_ajaran_id')
    .notNull()
    .references(() => tahunAjaran.id),
  tanggalMulai: date('tanggal_mulai'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
