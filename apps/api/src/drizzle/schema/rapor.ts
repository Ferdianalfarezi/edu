import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
  jsonb,
  decimal,
  unique,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Komponen penilaian type — angka (numeric 0-100), huruf (A-E), or deskripsi (narrative).
 * Requirements: 36.1, 36.4
 */
export const tipeKomponenEnum = pgEnum('tipe_komponen', ['angka', 'huruf', 'deskripsi']);

/**
 * Rapor period — matches Kurikulum Merdeka assessment periods.
 * Requirements: 37.3, 37.4
 */
export const periodeRaporEnum = pgEnum('periode_rapor', [
  'uts_semester_1',
  'semester_1',
  'uts_semester_2',
  'semester_2',
]);

/**
 * Rapor status — draft until wali kelas finalizes.
 * Requirements: 38.7
 */
export const statusRaporEnum = pgEnum('status_rapor', ['draft', 'final']);

/**
 * Rapor nilai status — per-subject grade entry status.
 * Requirements: 37.6, 37.8
 */
export const statusNilaiEnum = pgEnum('status_nilai', ['draft', 'submitted']);

/**
 * komponen_penilaian — Assessment component configuration per tenant.
 * Each school can customize their grading components (e.g., UTS, UAS, Tugas Harian).
 * Supports angka/huruf/deskripsi types with configurable scale.
 *
 * Requirements: 36.1, 36.4
 */
export const komponenPenilaian = pgTable('komponen_penilaian', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  nama: varchar('nama', { length: 100 }).notNull(),
  tipe: tipeKomponenEnum('tipe').notNull(),
  skalaMin: integer('skala_min'),
  skalaMax: integer('skala_max'),
  isWajib: boolean('is_wajib').default(true),
  urutan: integer('urutan').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  bobotHuruf: jsonb('bobot_huruf'),
});

/**
 * rapor — Report card per class per period.
 * Created as draft, finalized by wali kelas. UNIQUE(kelas_id, tahun_ajaran_id, periode)
 * ensures one rapor per class per period per academic year.
 *
 * Requirements: 36.1, 37.5, 38.7
 */
export const rapor = pgTable(
  'rapor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    kelasId: uuid('kelas_id').notNull(),
    tahunAjaranId: uuid('tahun_ajaran_id').notNull(),
    periode: periodeRaporEnum('periode').notNull(),
    status: statusRaporEnum('status').notNull().default('draft'),
    finalizedBy: uuid('finalized_by'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deadline: timestamp('deadline', { withTimezone: true }),
  },
  (table) => ({
    uniqueKelasAjaranPeriode: unique('rapor_kelas_ajaran_periode_unique').on(
      table.kelasId,
      table.tahunAjaranId,
      table.periode,
    ),
  }),
);

/**
 * rapor_nilai — Per-student per-subject grade entry within a rapor.
 * komponen_nilai is JSONB: [{komponen_id: string, nilai: string | number}]
 * p5_deskripsi is JSONB: [{dimensi: string, deskripsi: string}]
 *
 * Requirements: 36.1, 36.4, 37.5
 */
export const raporNilai = pgTable(
  'rapor_nilai',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    raporId: uuid('rapor_id').notNull(),
    siswaId: uuid('siswa_id').notNull(),
    mataPelajaranId: uuid('mata_pelajaran_id').notNull(),
    guruId: uuid('guru_id').notNull(),
    komponenNilai: jsonb('komponen_nilai').notNull(),
    capaianPembelajaran: text('capaian_pembelajaran'),
    status: statusNilaiEnum('status').notNull().default('draft'),
    peringkat: integer('peringkat'),
    rataRata: decimal('rata_rata', { precision: 5, scale: 2 }),
    catatanWaliKelas: text('catatan_wali_kelas'),
    p5Deskripsi: jsonb('p5_deskripsi'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    /** Composite index for rapor grade lookup by rapor and student (Requirements: 35.1) */
    raporSiswaIdx: index('idx_rapor_nilai_rapor').on(table.raporId, table.siswaId),
    /** Unique constraint for bulk upsert ON CONFLICT support (Requirements: 2.2, 2.7) */
    uniqueRaporSiswaMapelTenant: unique('rapor_nilai_upsert_unique').on(
      table.raporId,
      table.siswaId,
      table.mataPelajaranId,
      table.tenantId,
    ),
  }),
);

/**
 * rapor_nilai_audit — Audit trail for grade changes.
 * Records who changed what value, when, and what the old/new values were.
 *
 * Requirements: 2.5
 */
export const raporNilaiAudit = pgTable('rapor_nilai_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  raporNilaiId: uuid('rapor_nilai_id').notNull(),
  userId: uuid('user_id').notNull(),
  action: varchar('action', { length: 10 }).notNull(), // 'insert' | 'update'
  siswaId: uuid('siswa_id').notNull(),
  mataPelajaranId: uuid('mata_pelajaran_id').notNull(),
  komponenId: uuid('komponen_id'),
  oldValue: text('old_value'),
  newValue: text('new_value').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
});

/**
 * komponen_penilaian_mapel — Junction table for per-mapel komponen assignment.
 * Allows different subjects to have different assessment components.
 * If no entries exist for a mapel, all global komponen apply (backward compatible).
 *
 * Requirements: 2.10
 */
export const komponenPenilaianMapel = pgTable(
  'komponen_penilaian_mapel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    komponenPenilaianId: uuid('komponen_penilaian_id').notNull(),
    mataPelajaranId: uuid('mata_pelajaran_id').notNull(),
  },
  (table) => ({
    uniqueTenantKomponenMapel: unique('komponen_penilaian_mapel_unique').on(
      table.tenantId,
      table.komponenPenilaianId,
      table.mataPelajaranId,
    ),
  }),
);
