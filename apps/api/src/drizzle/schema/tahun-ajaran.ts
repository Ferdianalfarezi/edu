import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { tenant } from './tenant';
import { tahunAjaranStatusEnum } from './enums';

export const tahunAjaran = pgTable('tahun_ajaran', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  nama: varchar('nama', { length: 50 }).notNull(), // e.g. "2024/2025"
  tanggalMulai: date('tanggal_mulai').notNull(),
  tanggalSelesai: date('tanggal_selesai').notNull(),
  status: tahunAjaranStatusEnum('status').notNull().default('disiapkan'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
