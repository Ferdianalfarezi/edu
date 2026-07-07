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
  }),
);
