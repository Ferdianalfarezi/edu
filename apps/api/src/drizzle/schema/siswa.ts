import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenant } from './tenant';
import { kelas } from './kelas';
import { user } from './user';
import { siswaStatusEnum, jenisKelaminEnum } from './enums';

export const siswa = pgTable(
  'siswa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    kelasId: uuid('kelas_id').references(() => kelas.id),
    nama: varchar('nama', { length: 255 }).notNull(),
    nisn: varchar('nisn', { length: 20 }),
    jenisKelamin: jenisKelaminEnum('jenis_kelamin'),
    tanggalLahir: date('tanggal_lahir'),
    alamat: text('alamat'),
    orangTuaId: uuid('orang_tua_id').references(() => user.id),
    status: siswaStatusEnum('status').default('aktif'),
    tanggalKeluar: date('tanggal_keluar'),
    alasanKeluar: text('alasan_keluar'),
    processedBy: uuid('processed_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // NISN unique per tenant, only for active students with non-null NISN
    nisnTenantIdx: uniqueIndex('idx_siswa_nisn_tenant')
      .on(table.nisn, table.tenantId)
      .where(sql`${table.nisn} IS NOT NULL AND ${table.status} = 'aktif'`),
    /** Index for parent → student lookups (Requirements: 35.1) */
    orangTuaIdx: index('idx_siswa_orang_tua').on(table.orangTuaId),
  }),
);
