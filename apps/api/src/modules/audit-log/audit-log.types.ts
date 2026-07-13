export type AuditAction =
  'create' | 'update' | 'delete' | 'deactivate' | 'activate' | 'role_change' | 'password_reset';

export type AuditEntityType =
  'tagihan' | 'pembayaran' | 'user' | 'role_assignment' | 'tenant_config';
