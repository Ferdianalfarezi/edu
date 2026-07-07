import { Platform, Role } from '../enums';

export interface LoginRequest {
  email?: string;
  password?: string;
  phone?: string;
  platform: Platform;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  must_change_password: boolean;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  tenant_id: string | null;
  tenants?: TenantInfo[];
}

export interface TenantInfo {
  id: string;
  name: string;
  logo_url?: string;
}

export interface JwtPayload {
  sub: string; // user_id
  role: Role;
  tenant_id: string | null;
  iat?: number;
  exp?: number;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ResetPasswordConfirm {
  token: string;
  new_password: string;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}
