import {
  pgTable,
  uuid,
  varchar,
  integer,
  date,
  boolean,
  timestamp,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenant } from './tenant';
import { kelas } from './kelas';
import { mataPelajaran } from './mata-pelajaran';
import { user } from './user';
import { tahunAjaran } from './tahun-ajaran';

/**
 * jadwal_pelajaran — Class schedule per semester.
 * One entry per slot (kelas + hari + jam_ke + mapel + guru).
 * Linked to tahun_ajaran and bounded by validity dates.
 *
 * Requirements: 27.1
 */
export const jadwalPelajaran = pgTable(
  'jadwal_pelajaran',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    kelasId: uuid('kelas_id')
      .notNull()
      .references(() => kelas.id),
    mataPelajaranId: uuid('mata_pelajaran_id').references(() => mataPelajaran.id),
    guruId: uuid('guru_id').references(() => user.id),
    tahunAjaranId: uuid('tahun_ajaran_id')
      .notNull()
      .references(() => tahunAjaran.id),
    semester: integer('semester').notNull(),
    hari: varchar('hari', { length: 10 }).notNull(),
    jamKe: integer('jam_ke').notNull(),
    tanggalMulaiBerlaku: date('tanggal_mulai_berlaku').notNull(),
    tanggalSelesaiBerlaku: date('tanggal_selesai_berlaku').notNull(),
    isIstirahat: boolean('is_istirahat').default(false),
    isVacant: boolean('is_vacant').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    semesterCheck: check('jadwal_semester_check', sql`${table.semester} IN (1, 2)`),
    hariCheck: check(
      'jadwal_hari_check',
      sql`${table.hari} IN ('senin','selasa','rabu','kamis','jumat','sabtu')`,
    ),
    jamKeCheck: check('jadwal_jam_ke_check', sql`${table.jamKe} BETWEEN 1 AND 10`),
    /** Composite index for guru schedule lookup by day and validity range (Requirements: 35.1) */
    guruHariIdx: index('idx_jadwal_guru_hari').on(
      table.guruId,
      table.hari,
      table.tanggalMulaiBerlaku,
      table.tanggalSelesaiBerlaku,
    ),
  }),
);

/**
 * guru_pengganti — Substitute teacher assignment for a specific date.
 * Grants attendance input access to the substitute for that class+date only.
 *
 * Requirements: 28.1
 */
export const guruPengganti = pgTable('guru_pengganti', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  guruPenggantiId: uuid('guru_pengganti_id')
    .notNull()
    .references(() => user.id),
  kelasId: uuid('kelas_id')
    .notNull()
    .references(() => kelas.id),
  mataPelajaranId: uuid('mata_pelajaran_id')
    .notNull()
    .references(() => mataPelajaran.id),
  tanggal: date('tanggal').notNull(),
  ditugaskanOleh: uuid('ditugaskan_oleh')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
