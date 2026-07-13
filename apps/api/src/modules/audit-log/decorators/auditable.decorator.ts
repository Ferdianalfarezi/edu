import { SetMetadata } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '../audit-log.types';

export const AUDITABLE_KEY = 'auditable';

export interface AuditableOptions {
  entityType: AuditEntityType;
  action: AuditAction;
  /** How to extract entity ID from request (param name or body field) */
  entityIdSource: 'params.id' | 'body.id' | 'response.id';
  /** How to extract tenant_id (from body, params, or entity lookup) */
  tenantIdSource?: 'body.tenant_id' | 'params.tenantId' | 'entity_lookup';
  /** Whether audit failure should rollback the operation (default: true for sensitive entities) */
  strictMode?: boolean;
  /** Fields to exclude from before/after diff (e.g., password hashes) */
  excludeFields?: string[];
}

/**
 * Decorator that marks a route handler for audit logging.
 * Used in combination with AuditInterceptor to capture before/after state
 * and write immutable audit_log entries.
 *
 * @example
 * ```ts
 * @Patch(':id')
 * @Auditable({
 *   entityType: 'tagihan',
 *   action: 'update',
 *   entityIdSource: 'params.id',
 *   tenantIdSource: 'entity_lookup',
 *   strictMode: true,
 *   excludeFields: ['bukti_transfer_url'],
 * })
 * async updateTagihan(@Param('id') id: string, @Body() dto: UpdateTagihanDto) {
 *   return this.tagihanService.update(id, dto);
 * }
 * ```
 */
export const Auditable = (options: AuditableOptions) => SetMetadata(AUDITABLE_KEY, options);
