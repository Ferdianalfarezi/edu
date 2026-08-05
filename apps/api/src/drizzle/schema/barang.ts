import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums baru untuk Req 5
export const kondisiBarangEnum = pgEnum('kondisi_barang', ['bagus', 'perlu_perbaikan', 'rusak']);
export const sumberDanaEnum = pgEnum('sumber_dana', ['yayasan', 'unit_sekolah', 'bos']);
export const kategoriBarangEnum = pgEnum('kategori_barang', ['peralatan', 'perlengkapan']);

// TypeScript type aliases for use in DTOs and service layer
export type KondisiBarang = (typeof kondisiBarangEnum.enumValues)[number];
export type SumberDana = (typeof sumberDanaEnum.enumValues)[number];
export type KategoriBarang = (typeof kategoriBarangEnum.enumValues)[number];

/**
 * Tabel barang — menyimpan data inventaris barang milik sekolah.
 *
 * Requirements: 1.2, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 * - Soft delete via kolom deleted_at (null = aktif, non-null = terhapus)
 * - Multi-tenancy via tenant_id dari JWT
 * - Composite indexes untuk optimasi query list dan search
 * - Kolom baru (lokasi, kondisi_barang, sumber_dana, kategori) nullable untuk backward compatibility
 */
export const barang = pgTable(
  'barang',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    nama: varchar('nama', { length: 255 }).notNull(),
    deskripsi: text('deskripsi'),
    jumlah: integer('jumlah').notNull().default(0),
    // ─── Kolom baru Req 5 ───
    lokasi: varchar('lokasi', { length: 255 }), // nullable, opsional
    kondisiBarang: kondisiBarangEnum('kondisi_barang'), // nullable untuk data lama
    sumberDana: sumberDanaEnum('sumber_dana'), // nullable untuk data lama
    kategori: kategoriBarangEnum('kategori'), // nullable untuk data lama
    // ────────────────────────
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantCreatedIdx: index('idx_barang_tenant_created').on(table.tenantId, table.createdAt),
    tenantNamaIdx: index('idx_barang_tenant_nama').on(table.tenantId, table.nama),
    // Index baru untuk filter Req 5
    kondisiIdx: index('idx_barang_kondisi').on(table.tenantId, table.kondisiBarang),
    sumberDanaIdx: index('idx_barang_sumber_dana').on(table.tenantId, table.sumberDana),
    kategoriIdx: index('idx_barang_kategori').on(table.tenantId, table.kategori),
  }),
);
