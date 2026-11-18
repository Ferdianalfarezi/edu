import { pgTable, uuid, varchar, date, text, timestamp } from 'drizzle-orm/pg-core';
import { tenant } from './tenant';
import { user } from './user';

/**
 * Pendidikan terakhir guru (disimpan sebagai teks supaya mudah ditambah).
 */
export const PENDIDIKAN_TERAKHIR = ['SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3'] as const;

/**
 * guru_profil — data tambahan khusus user ber-role guru (1 baris per guru).
 * Nama, email, dan telepon tetap di tabel user.
 */
export const guruProfil = pgTable('guru_profil', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  /** NUPTK atau NIP */
  nomorInduk: varchar('nomor_induk', { length: 30 }),
  tanggalLahir: date('tanggal_lahir'),
  pendidikanTerakhir: varchar('pendidikan_terakhir', { length: 10 }),
  kampus: varchar('kampus', { length: 255 }),
  alamat: text('alamat'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
