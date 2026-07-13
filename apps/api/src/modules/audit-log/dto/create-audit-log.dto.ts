import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuditAction, AuditEntityType } from '../audit-log.types';

const AUDIT_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'delete',
  'deactivate',
  'activate',
  'role_change',
  'password_reset',
];

const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  'tagihan',
  'pembayaran',
  'user',
  'role_assignment',
  'tenant_config',
];

export class CreateAuditLogDto {
  @IsNotEmpty()
  @IsString()
  action: AuditAction;

  @IsNotEmpty()
  @IsUUID()
  actorUserId: string;

  @IsNotEmpty()
  @IsString()
  actorRole: string;

  @IsNotEmpty()
  @IsString()
  entityType: AuditEntityType;

  @IsNotEmpty()
  @IsUUID()
  entityId: string;

  @IsNotEmpty()
  @IsUUID()
  tenantId: string;

  @IsNotEmpty()
  @IsString()
  ipAddress: string;

  @IsOptional()
  beforeValues?: Record<string, unknown> | null;

  @IsOptional()
  afterValues?: Record<string, unknown> | null;
}
