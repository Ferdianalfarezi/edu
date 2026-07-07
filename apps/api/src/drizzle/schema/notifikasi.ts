import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  pgEnum,
  unique,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Enum: status pengiriman notifikasi.
 * - pending: belum dikirim / dalam antrian
 * - terkirim: berhasil dikirim ke device
 * - gagal: gagal setelah retry habis
 */
export const statusPengirimanEnum = pgEnum('status_pengiriman', ['pending', 'terkirim', 'gagal']);

/**
 * Enum: platform device untuk FCM token.
 */
export const platformDeviceEnum = pgEnum('platform_device', ['android', 'ios']);

/**
 * Tabel notifikasi — menyimpan riwayat notifikasi push ke orang tua.
 *
 * Requirements: 6.5, 7.2, 7.3
 * - status_pengiriman tracks delivery state (pending → terkirim | gagal)
 * - retry_count tracks FCM retry attempts (max 3)
 * - data holds additional structured payload (siswa_id, kelas, etc.)
 */
export const notifikasi = pgTable(
  'notifikasi',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(), // recipient (orang_tua)
    siswaId: uuid('siswa_id'),
    tipe: varchar('tipe', { length: 50 }).notNull(), // 'absensi', 'tagihan_baru', 'verifikasi', 'rapor', etc.
    judul: varchar('judul', { length: 255 }).notNull(),
    pesan: text('pesan').notNull(),
    data: jsonb('data'), // additional structured data
    statusPengiriman: statusPengirimanEnum('status_pengiriman').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Composite index for user notification history sorted by newest first (Requirements: 35.1) */
    userCreatedAtIdx: index('idx_notifikasi_user').on(table.userId, table.createdAt),
  }),
);

/**
 * Tabel notifikasi_preferensi — per-child notification preferences for parents.
 *
 * Requirements: 6.5, 25.2
 * - kehadiran_enabled: default OFF (parent must opt-in to "hadir" notifications)
 * - ketidakhadiran_enabled: default ON (izin/sakit/alpa sent by default)
 * - UNIQUE(user_id, siswa_id): one preference record per parent-child pair
 */
export const notifikasiPreferensi = pgTable(
  'notifikasi_preferensi',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    siswaId: uuid('siswa_id').notNull(),
    kehadiranEnabled: boolean('kehadiran_enabled').notNull().default(false),
    ketidakhadiranEnabled: boolean('ketidakhadiran_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserSiswa: unique('uq_notifikasi_preferensi_user_siswa').on(table.userId, table.siswaId),
  }),
);

/**
 * Tabel device_token — FCM token storage per user device.
 *
 * Requirements: 6.1 (push notification delivery)
 * - platform: android or ios
 * - is_active: deactivated when token is stale or user logs out
 */
export const deviceToken = pgTable('device_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  fcmToken: varchar('fcm_token', { length: 500 }).notNull(),
  platform: platformDeviceEnum('platform'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
