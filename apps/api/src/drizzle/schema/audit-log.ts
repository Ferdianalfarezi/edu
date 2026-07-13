import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Append-only audit log for sensitive entity operations.
 * Covers: Tagihan, Pembayaran, User, Role assignment, Tenant configuration.
 * This table is IMMUTABLE — no updated_at column, no UPDATE/DELETE allowed at application layer.
 *
 * Requirements: 5.1, 5.3, 5.6, 5.8
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorRole: varchar('actor_role', { length: 50 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }).notNull(),
    beforeValues: jsonb('before_values'),
    afterValues: jsonb('after_values'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // NO updated_at — append-only, immutable table
  },
  (table) => ({
    /** Composite index for tenant-scoped audit queries sorted by time (Requirements: 5.4) */
    tenantCreatedIdx: index('idx_audit_logs_tenant_created').on(table.tenantId, table.createdAt),
    /** Composite index for entity lookup (Requirements: 5.4) */
    entityIdx: index('idx_audit_logs_entity').on(table.entityType, table.entityId),
    /** Composite index for actor-based queries sorted by time (Requirements: 5.4) */
    actorIdx: index('idx_audit_logs_actor').on(table.actorUserId, table.createdAt),
    /** Composite index for action-based queries sorted by time (Requirements: 5.4) */
    actionIdx: index('idx_audit_logs_action').on(table.action, table.createdAt),
  }),
);
