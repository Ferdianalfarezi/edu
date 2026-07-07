import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  date,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { tenant } from './tenant';
import { siswa } from './siswa';
import { kelas } from './kelas';
import { user } from './user';

/**
 * PostgreSQL enum for attendance status.
 * Used by absensi and absensi_audit tables.
 *
 * Requirements: 1.2 (status options: hadir, izin, sakit, alpa)
 */
export const statusKehadiranEnum = pgEnum('status_kehadiran', ['hadir', 'izin', 'sakit', 'alpa']);

/**
 * absensi — Daily attendance record per student.
 * One record per student per day (not per lesson).
 * Enforced via UNIQUE(siswa_id, tanggal).
 *
 * Requirements: 1.2, 1.8
 */
export const absensi = pgTable(
  'absensi',
  {
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
    tanggal: date('tanggal').notNull(),
    status: statusKehadiranEnum('status').notNull(),
    guruId: uuid('guru_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    /** One attendance record per student per day */
    siswaPerHari: unique('absensi_siswa_tanggal_unique').on(table.siswaId, table.tanggal),
    /** Composite index for tenant-scoped queries by class and date (Requirements: 35.1) */
    tenantKelasTanggalIdx: index('idx_absensi_tenant_kelas_tanggal').on(
      table.tenantId,
      table.kelasId,
      table.tanggal,
    ),
  }),
);

/**
 * absensi_audit — Append-only log for attendance edits.
 * Records who changed what, from what, to what.
 * No updated_at — immutable by design.
 *
 * Requirements: 2.5, 2.6
 */
export const absensiAudit = pgTable('absensi_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  absensiId: uuid('absensi_id')
    .notNull()
    .references(() => absensi.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => user.id),
  role: varchar('role', { length: 20 }).notNull(),
  statusSebelum: statusKehadiranEnum('status_sebelum').notNull(),
  statusSesudah: statusKehadiranEnum('status_sesudah').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
