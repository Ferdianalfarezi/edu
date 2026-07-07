import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';

// ─── PG Enums ────────────────────────────────────────────────────────────────

/**
 * RPP content type — richtext (HTML content written in editor) or file (uploaded PDF/DOC/PPT).
 * Requirements: 41.1, 41.8
 */
export const kontenTypeRppEnum = pgEnum('konten_type_rpp', ['richtext', 'file']);

/**
 * RPP publication status — draft (only visible to creator) or published (visible to all in tenant).
 * Requirements: 41.5, 41.6, 41.8
 */
export const statusRppEnum = pgEnum('status_rpp', ['draft', 'published']);

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * kategori_rpp — Shared category pool per tenant for organizing RPP documents.
 * Auto-created when guru inputs a new category name. UNIQUE(tenant_id, nama)
 * ensures no duplicate category names within a school.
 *
 * Requirements: 41.3, 41.4
 */
export const kategoriRpp = pgTable(
  'kategori_rpp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    nama: varchar('nama', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueTenantNama: unique('uq_kategori_rpp_tenant_nama').on(table.tenantId, table.nama),
  }),
);

/**
 * rpp — Rencana Pelaksanaan Pembelajaran / Modul Ajar.
 * Stores either rich text HTML content or a reference to an uploaded file (S3 path).
 * Only published RPP are visible to other users in the same tenant.
 *
 * Requirements: 41.4, 41.8
 */
export const rpp = pgTable(
  'rpp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    guruId: uuid('guru_id').notNull(),
    mataPelajaranId: uuid('mata_pelajaran_id').notNull(),
    kategoriId: uuid('kategori_id').notNull(),
    judul: varchar('judul', { length: 255 }).notNull(),
    kontenType: kontenTypeRppEnum('konten_type').notNull(),
    konten: text('konten'), // Rich text HTML content (when konten_type = 'richtext')
    fileUrl: varchar('file_url', { length: 500 }), // S3 path (when konten_type = 'file')
    fileNama: varchar('file_nama', { length: 255 }), // Original file name
    fileSize: integer('file_size'), // File size in bytes
    tahunTerbit: integer('tahun_terbit').notNull(),
    status: statusRppEnum('status').notNull().default('draft'),
    tanggalPublish: timestamp('tanggal_publish', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Composite index for tenant-scoped RPP listing by status and publish date (Requirements: 35.1) */
    tenantStatusIdx: index('idx_rpp_tenant_status').on(
      table.tenantId,
      table.status,
      table.tanggalPublish,
    ),
  }),
);

/**
 * rpp_favorit — Guru favorites on published RPP.
 * Each guru can favorite any published RPP (including their own).
 * UNIQUE(guru_id, rpp_id) prevents duplicate favorites.
 *
 * Requirements: 44.4
 */
export const rppFavorit = pgTable(
  'rpp_favorit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guruId: uuid('guru_id').notNull(),
    rppId: uuid('rpp_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueGuruRpp: unique('uq_rpp_favorit_guru_rpp').on(table.guruId, table.rppId),
  }),
);
