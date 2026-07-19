import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { tenant } from './tenant';
import { user } from './user';

/**
 * Enum: mode pengiriman pengumuman.
 * - broadcast: ke seluruh orang tua di sekolah
 * - targeted: ke orang tua siswa tertentu
 */
export const pengumumanModeEnum = pgEnum('pengumuman_mode', ['broadcast', 'targeted']);

/**
 * Enum: status pengumuman.
 * - draft: baru dibuat, belum dikirim
 * - terkirim: notifikasi berhasil dikirim
 * - gagal: pengiriman gagal setelah retry
 */
export const pengumumanStatusEnum = pgEnum('pengumuman_status', ['draft', 'terkirim', 'gagal']);

/**
 * Tabel pengumuman — menyimpan data pengumuman dari admin/kepala sekolah.
 *
 * Requirements: 2.2, 5.1, 7.4
 * - mode: broadcast atau targeted
 * - status: lifecycle draft → terkirim | gagal
 * - jumlah_penerima: jumlah orang tua unik yang menerima
 */
export const pengumuman = pgTable(
  'pengumuman',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    judul: varchar('judul', { length: 255 }).notNull(),
    deskripsi: text('deskripsi').notNull(),
    mode: pengumumanModeEnum('mode').notNull(),
    jumlahPenerima: integer('jumlah_penerima').notNull().default(0),
    status: pengumumanStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index('idx_pengumuman_tenant_created').on(table.tenantId, table.createdAt),
  }),
);

/**
 * Tabel pengumuman_penerima — junction table untuk tracking penerima pengumuman.
 *
 * Requirements: 3.3, 7.4
 * - Unique constraint: satu user hanya bisa menjadi penerima satu kali per pengumuman
 * - Digunakan untuk access control: hanya penerima yang bisa lihat detail
 */
export const pengumumanPenerima = pgTable(
  'pengumuman_penerima',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pengumumanId: uuid('pengumuman_id')
      .notNull()
      .references(() => pengumuman.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniquePengumumanUser: uniqueIndex('idx_pengumuman_penerima_unique').on(
      table.pengumumanId,
      table.userId,
    ),
    userIdx: index('idx_pengumuman_penerima_user').on(table.userId),
  }),
);
