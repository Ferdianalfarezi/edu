import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  bigint,
  text,
  date,
  timestamp,
  unique,
  check,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── PG Enums ────────────────────────────────────────────────────────────────

/**
 * Status pembayaran tagihan SPP.
 * belum_bayar → menunggu_verifikasi → lunas/cicilan/ditolak/dibatalkan
 */
export const statusPembayaranEnum = pgEnum('status_pembayaran', [
  'belum_bayar',
  'menunggu_verifikasi',
  'cicilan',
  'lunas',
  'ditolak',
  'dibatalkan',
]);

/**
 * Metode pembayaran pada transaksi.
 * upload_bukti = orang tua upload foto bukti transfer
 * tunai = bendahara catat pembayaran tunai
 * transfer_manual = bendahara catat transfer manual
 */
export const metodePembayaranEnum = pgEnum('metode_pembayaran', [
  'upload_bukti',
  'tunai',
  'transfer_manual',
]);

/**
 * Status verifikasi transaksi.
 * pending → approved/rejected
 */
export const statusTransaksiEnum = pgEnum('status_transaksi', ['pending', 'approved', 'rejected']);

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * Tagihan SPP bulanan per siswa.
 * One record per student per month. Supports installment payments (cicilan).
 *
 * Requirements: 9.2, 9.4
 */
export const tagihan = pgTable(
  'tagihan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    siswaId: uuid('siswa_id').notNull(),
    bulan: integer('bulan').notNull(),
    tahun: integer('tahun').notNull(),
    tahunAjaranId: uuid('tahun_ajaran_id'),
    nominal: bigint('nominal', { mode: 'number' }).notNull(),
    totalDibayar: bigint('total_dibayar', { mode: 'number' }).notNull().default(0),
    status: statusPembayaranEnum('status').notNull().default('belum_bayar'),
    tanggalJatuhTempo: date('tanggal_jatuh_tempo'),
    alasanPembatalan: text('alasan_pembatalan'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSiswaBulanTahun: unique('uq_tagihan_siswa_bulan_tahun').on(
      table.siswaId,
      table.bulan,
      table.tahun,
    ),
    bulanCheck: check('chk_tagihan_bulan', sql`${table.bulan} BETWEEN 1 AND 12`),
    /** Composite index for tenant-scoped status queries (Requirements: 35.1) */
    tenantStatusIdx: index('idx_tagihan_tenant_status').on(table.tenantId, table.status),
    /** Composite index for student billing history by year (Requirements: 35.1) */
    siswaIdx: index('idx_tagihan_siswa').on(table.siswaId, table.tahun),
  }),
);

/**
 * Transaksi pembayaran per tagihan.
 * Each tagihan can have multiple transactions (cicilan).
 * Tracks payment method, verification status, and reference number.
 *
 * Requirements: 13.5, 14.4
 */
export const tagihanTransaksi = pgTable('tagihan_transaksi', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  tagihanId: uuid('tagihan_id').notNull(),
  jumlahBayar: bigint('jumlah_bayar', { mode: 'number' }).notNull(),
  metode: metodePembayaranEnum('metode').notNull(),
  status: statusTransaksiEnum('status').notNull().default('pending'),
  buktiTransferUrl: varchar('bukti_transfer_url', { length: 500 }),
  catatan: text('catatan'),
  alasanPenolakan: text('alasan_penolakan'),
  verifiedBy: uuid('verified_by'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  uploadedBy: uuid('uploaded_by'),
  nomorReferensi: varchar('nomor_referensi', { length: 50 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only audit trail for billing operations.
 * This table is IMMUTABLE — no updated_at column, no UPDATE/DELETE allowed.
 * Every billing action (create, edit, cancel, verify) generates a new row.
 *
 * Requirements: 29.1, 29.2
 */
export const auditTrail = pgTable(
  'audit_trail',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    jenisAksi: varchar('jenis_aksi', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    nilaiSebelum: jsonb('nilai_sebelum'),
    nilaiSesudah: jsonb('nilai_sesudah'),
    alasan: text('alasan'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // NO updated_at — immutable, append-only table
  },
  (table) => ({
    /** Composite index for tenant-scoped audit trail queries sorted by newest first (Requirements: 35.1) */
    tenantCreatedAtIdx: index('idx_audit_trail_tenant').on(table.tenantId, table.createdAt),
  }),
);
