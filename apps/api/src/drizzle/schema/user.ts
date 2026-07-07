import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenant } from './tenant';
import { userRoleEnum } from './enums';

export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenant.id), // NULL for super_admin and orang_tua
    nama: varchar('nama', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    passwordHash: varchar('password_hash', { length: 255 }), // NULL for orang_tua
    role: userRoleEnum('role').notNull(),
    isActive: boolean('is_active').default(true),
    mustChangePassword: boolean('must_change_password').default(false),
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    tokensInvalidatedAt: timestamp('tokens_invalidated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Unique email per tenant — partial index (only where email is not null)
    emailTenantIdx: uniqueIndex('idx_user_email_tenant')
      .on(table.email, table.tenantId)
      .where(sql`${table.email} IS NOT NULL`),
    // Index on phone for orang_tua lookup
    phoneIdx: index('idx_user_phone')
      .on(table.phone)
      .where(sql`${table.phone} IS NOT NULL`),
  }),
);
