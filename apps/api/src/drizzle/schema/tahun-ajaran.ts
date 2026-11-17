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
  // Rentang tiap semester (diatur sekolah, default: Sem 1 s.d. 31 Des, Sem 2 mulai 1 Jan)
  semester1Mulai: date('semester_1_mulai').notNull(),
  semester1Selesai: date('semester_1_selesai').notNull(),
  semester2Mulai: date('semester_2_mulai').notNull(),
  semester2Selesai: date('semester_2_selesai').notNull(),
  status: tahunAjaranStatusEnum('status').notNull().default('disiapkan'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
