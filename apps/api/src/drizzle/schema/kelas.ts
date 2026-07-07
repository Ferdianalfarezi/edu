import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { tenant } from './tenant';
import { tahunAjaran } from './tahun-ajaran';
import { user } from './user';

export const kelas = pgTable('kelas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  tahunAjaranId: uuid('tahun_ajaran_id')
    .notNull()
    .references(() => tahunAjaran.id),
  nama: varchar('nama', { length: 50 }).notNull(), // e.g. "1A", "6B"
  tingkat: integer('tingkat').notNull(), // 1-6 (SD), 1-3 (SMP), etc.
  waliKelasId: uuid('wali_kelas_id').references(() => user.id),
  kapasitas: integer('kapasitas'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
