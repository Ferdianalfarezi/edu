import { pgTable, uuid, varchar, integer, text, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Tabel barang — menyimpan data inventaris barang milik sekolah.
 *
 * Requirements: 1.2, 4.2, 5.5, 5.6
 * - Soft delete via kolom deleted_at (null = aktif, non-null = terhapus)
 * - Multi-tenancy via tenant_id dari JWT
 * - Composite indexes untuk optimasi query list dan search
 */
export const barang = pgTable(
  'barang',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    nama: varchar('nama', { length: 255 }).notNull(),
    deskripsi: text('deskripsi'),
    jumlah: integer('jumlah').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    tenantCreatedIdx: index('idx_barang_tenant_created').on(table.tenantId, table.createdAt),
    tenantNamaIdx: index('idx_barang_tenant_nama').on(table.tenantId, table.nama),
  }),
);
