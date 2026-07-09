import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@edu/shared';
import { RequestUser } from '../../modules/auth/interfaces';

/**
 * Guard that validates cross-tenant access for orang_tua (parents).
 *
 * Parents have `tenant_id = null` and a `tenants[]` array listing
 * the tenant IDs they're authorized to access (derived from their children's schools).
 *
 * This guard checks that any tenant_id referenced in the request (via params, query, or body)
 * is within the parent's authorized tenants list.
 *
 * For non-parent roles:
 * - super_admin: bypasses tenant check entirely
 * - All other staff roles: only their own tenant_id is valid (enforced elsewhere)
 *
 * Usage: Apply on endpoints where orang_tua might access cross-tenant resources.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // Super admin can access any tenant
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    // Extract the requested tenant_id from route params, query, or body
    const requestedTenantId = this.extractTenantId(request);

    // If no tenant_id in the request, allow (other guards/interceptors will handle)
    if (!requestedTenantId) {
      return true;
    }

    // For orang_tua: validate against their authorized tenants list
    if (user.role === Role.ORANG_TUA) {
      const authorizedTenants = user.tenants || [];

      if (!authorizedTenants.includes(requestedTenantId)) {
        throw new ForbiddenException("You do not have access to this school's data");
      }

      return true;
    }

    // For staff roles: the requested tenant must match their own tenant_id
    if (user.tenant_id && requestedTenantId !== user.tenant_id) {
      throw new ForbiddenException("You do not have access to this school's data");
    }

    return true;
  }

  /**
   * Extract tenant_id from the request in order of precedence:
   * 1. Route params (e.g., /tenants/:tenantId)
   * 2. Query params (e.g., ?tenant_id=...)
   * 3. Request body (e.g., { tenant_id: ... })
   */
  private extractTenantId(request: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  }): string | undefined {
    return (
      request.params?.tenantId ||
      request.params?.tenant_id ||
      (request.query?.tenant_id as string | undefined) ||
      (request.body?.tenant_id as string | undefined)
    );
  }
}
