import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { tenant } from './tenant';

export const mataPelajaran = pgTable('mata_pelajaran', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id),
  nama: varchar('nama', { length: 100 }).notNull(),
  kode: varchar('kode', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
