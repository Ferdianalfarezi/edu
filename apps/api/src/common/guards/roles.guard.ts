import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@edu/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../../modules/auth/interfaces';

/**
 * Guard that enforces role-based access control.
 * Reads the @Roles() decorator metadata and compares against the authenticated user's role.
 *
 * If no @Roles() decorator is present, access is allowed (guard passes).
 * If @Roles() is present but user role is not in the list, returns 403 Forbidden.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator → allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to access this resource');
    }

    return true;
  }
}
