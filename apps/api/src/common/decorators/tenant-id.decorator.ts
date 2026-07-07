import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../../modules/auth/interfaces';

/**
 * Parameter decorator that extracts the tenant_id from the authenticated user.
 * Returns null for super_admin and orang_tua (cross-tenant) users.
 *
 * @example
 * ```ts
 * @Get('/siswa')
 * listSiswa(@TenantId() tenantId: string) { ... }
 * ```
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    if (!user) {
      return null;
    }

    return user.tenant_id;
  },
);
