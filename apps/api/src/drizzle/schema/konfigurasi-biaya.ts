import { pgTable, pgEnum, uuid, bigint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Tipe konfigurasi biaya — menentukan apakah override berlaku per siswa atau per kelas.
 *
 * Requirements: 6.1, 6.2
 */
export const konfigBiayaTypeEnum = pgEnum('konfigurasi_biaya_type', ['per_siswa', 'per_kelas']);

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * Tabel konfigurasi_biaya — override nominal biaya per siswa atau per kelas.
 *
 * Hierarki prioritas saat generate tagihan:
 *   1. Override per siswa (baris dengan siswa_id)
 *   2. Override per kelas (baris dengan kelas_id)
 *   3. Global tenant (dari konfigurasi_sekolah)
 *
 * Constraints:
 * - Unique per (tenant_id, siswa_id): satu override per siswa per tenant
 * - Unique per (tenant_id, kelas_id): satu override per kelas per tenant
 *
 * Requirements: 6.1, 6.2, 6.6
 */
export const konfigurasiBiaya = pgTable(
  'konfigurasi_biaya',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    type: konfigBiayaTypeEnum('type').notNull(),
    siswaId: uuid('siswa_id'), // not null if type = per_siswa
    kelasId: uuid('kelas_id'), // not null if type = per_kelas
    nominal: bigint('nominal', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Satu override per siswa per tenant
    tenantSiswaIdx: uniqueIndex('idx_konfigbiaya_tenant_siswa').on(table.tenantId, table.siswaId),
    // Satu override per kelas per tenant
    tenantKelasIdx: uniqueIndex('idx_konfigbiaya_tenant_kelas').on(table.tenantId, table.kelasId),
  }),
);
