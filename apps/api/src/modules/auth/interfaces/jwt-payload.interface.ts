import { Role } from '@edu/shared';

/**
 * JWT access token payload structure.
 * Extracted by JwtStrategy and attached to the request object.
 */
export interface JwtPayload {
  /** user.id */
  sub: string;
  /** User's role */
  role: Role;
  /** Tenant (school) ID. NULL for super_admin and orang_tua */
  tenant_id: string | null;
  /** Accessible tenant IDs for cross-tenant orang_tua */
  tenants?: string[];
  /** Platform the token was issued for */
  platform: 'admin_panel' | 'mobile';
  /** JWT ID — used for token blacklisting */
  jti: string;
  /** Issued at (epoch seconds) */
  iat: number;
  /** Expiration (epoch seconds) */
  exp: number;
}

/**
 * The user object attached to Request after JWT validation.
 */
export interface RequestUser {
  id: string;
  role: Role;
  tenant_id: string | null;
  tenants?: string[];
  platform: 'admin_panel' | 'mobile';
  jti: string;
}
