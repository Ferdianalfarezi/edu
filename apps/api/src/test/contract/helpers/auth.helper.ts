import { JwtService } from '@nestjs/jwt';
import { Role } from '@edu/shared';
import { JWT_SECRET } from './test-app.factory';

const jwtService = new JwtService({ secret: JWT_SECRET });

export interface TokenOptions {
  role: Role;
  tenantId?: string;
  userId?: string;
}

/**
 * Generate a valid JWT token for contract testing.
 * Does NOT hit the login endpoint — directly creates a token.
 */
export function generateTestToken(options: TokenOptions): string {
  const { role, tenantId, userId } = options;
  const id = userId || crypto.randomUUID();
  const tenant = tenantId || crypto.randomUUID();

  return jwtService.sign(
    {
      sub: id,
      role,
      tenant_id: role === Role.ORANG_TUA ? null : tenant,
      platform: 'admin_panel',
      jti: crypto.randomUUID(),
      type: 'access',
    },
    { expiresIn: '1h' },
  );
}

export function adminToken(tenantId?: string): string {
  return generateTestToken({ role: Role.ADMIN, tenantId });
}

export function guruToken(tenantId?: string): string {
  return generateTestToken({ role: Role.GURU, tenantId });
}

export function bendaharaToken(tenantId?: string): string {
  return generateTestToken({ role: Role.BENDAHARA, tenantId });
}

export function kepalaSekolahToken(tenantId?: string): string {
  return generateTestToken({ role: Role.KEPALA_SEKOLAH, tenantId });
}

export function orangTuaToken(): string {
  return generateTestToken({ role: Role.ORANG_TUA });
}
