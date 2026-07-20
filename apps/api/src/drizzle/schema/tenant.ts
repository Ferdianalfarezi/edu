import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tenant = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: varchar('nama', { length: 255 }).notNull(),
    alamat: text('alamat'),
    telepon: varchar('telepon', { length: 20 }),
    email: varchar('email', { length: 255 }),
    logoUrl: varchar('logo_url', { length: 500 }),
    jumlahTingkat: integer('jumlah_tingkat').notNull().default(6),
    hariKerja: varchar('hari_kerja', { length: 10 }).notNull().default('6_hari'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    jumlahTingkatCheck: check('chk_jumlah_tingkat', sql`${table.jumlahTingkat} BETWEEN 1 AND 13`),
    hariKerjaCheck: check('chk_hari_kerja', sql`${table.hariKerja} IN ('5_hari', '6_hari')`),
  }),
);
