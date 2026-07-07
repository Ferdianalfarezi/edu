import { SetMetadata } from '@nestjs/common';
import { Role } from '@edu/shared';

export const ROLES_KEY = 'roles';

/**
 * Decorator that sets the allowed roles for a route handler.
 * Used in combination with RolesGuard to enforce role-based access control.
 *
 * @example
 * ```ts
 * @Roles(Role.ADMIN, Role.BENDAHARA)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Post('/tagihan/generate')
 * async generateTagihan(...) {}
 * ```
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
