import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap, tap } from 'rxjs';
import { Request } from 'express';
import { PoolClient } from 'pg';
import { Role } from '@edu/shared';
import { DrizzleService } from '../../drizzle/drizzle.service';
import { RequestUser } from '../../modules/auth/interfaces';

/**
 * Request-scoped Drizzle client key.
 * Downstream services can retrieve the tenant-scoped client from request.
 */
export const TENANT_CLIENT_KEY = 'tenantClient';

/**
 * TenantInterceptor — sets PostgreSQL session variables for RLS enforcement.
 *
 * Per ADR-001, this interceptor:
 * 1. Acquires a dedicated pg client from the pool
 * 2. Begins a transaction (SET LOCAL only works within transactions)
 * 3. Sets `app.tenant_id` for staff roles, or `app.tenant_ids` for orang_tua
 * 4. Stores the client on the request for downstream use
 * 5. Commits or rolls back on request completion/error
 * 6. Releases the client back to the pool
 *
 * Skips entirely for:
 * - super_admin (unrestricted access to all tenants)
 * - Unauthenticated requests (no user on request)
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(private readonly drizzleService: DrizzleService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: RequestUser }).user;

    // No user attached (unauthenticated or public route) — skip
    if (!user) {
      return next.handle();
    }

    // Super admin bypasses all tenant isolation
    if (user.role === Role.SUPER_ADMIN) {
      return next.handle();
    }

    // For orang_tua: validate tenants array is present
    if (user.role === Role.ORANG_TUA) {
      if (!user.tenants || user.tenants.length === 0) {
        throw new ForbiddenException('Parent user has no accessible tenants');
      }
      return this.executeWithTenantContext(request, user, next);
    }

    // Staff roles must have a tenant_id
    if (!user.tenant_id) {
      throw new ForbiddenException('Staff user must be associated with a tenant');
    }

    return this.executeWithTenantContext(request, user, next);
  }

  private executeWithTenantContext(
    request: Request,
    user: RequestUser,
    next: CallHandler,
  ): Observable<unknown> {
    let client: PoolClient;

    return from(this.acquireAndSetTenant(request, user)).pipe(
      switchMap((poolClient) => {
        client = poolClient;
        return next.handle();
      }),
      tap({
        next: () => {
          // On success: commit transaction and release client
          this.commitAndRelease(client);
        },
        error: () => {
          // On error: rollback transaction and release client
          this.rollbackAndRelease(client);
        },
      }),
    );
  }

  private async acquireAndSetTenant(request: Request, user: RequestUser): Promise<PoolClient> {
    const pool = this.drizzleService.getPool();
    const client = await pool.connect();

    try {
      // Begin transaction so SET LOCAL is scoped to this request
      await client.query('BEGIN');

      if (user.role === Role.ORANG_TUA) {
        // Validate cross-tenant access: only allow tenants from JWT
        await client.query(`SET LOCAL app.tenant_ids = '${this.escapeTenantIds(user.tenants!)}'`);
        // Also set app.tenant_id to empty for RLS fail-closed behavior on staff policies
        // The parent_cross_tenant policy uses app.tenant_ids instead
        await client.query(`SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000000'`);
      } else {
        // Staff role: set single tenant_id
        await client.query(`SET LOCAL app.tenant_id = '${this.escapeUuid(user.tenant_id!)}'`);
      }

      // Store the tenant-scoped client on the request for downstream use
      (request as unknown as Record<string, unknown>)[TENANT_CLIENT_KEY] = client;

      return client;
    } catch (error) {
      // If setup fails, rollback and release immediately
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }
      client.release();
      this.logger.error(`Failed to set tenant context for user ${user.id}: ${error}`);
      throw error;
    }
  }

  private async commitAndRelease(client: PoolClient): Promise<void> {
    if (!client) return;
    try {
      await client.query('COMMIT');
    } catch (error) {
      this.logger.error(`Failed to commit tenant transaction: ${error}`);
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore
      }
    } finally {
      client.release();
    }
  }

  private async rollbackAndRelease(client: PoolClient): Promise<void> {
    if (!client) return;
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      this.logger.error(`Failed to rollback tenant transaction: ${error}`);
    } finally {
      client.release();
    }
  }

  /**
   * Validate and escape a UUID string to prevent SQL injection.
   * UUIDs have a fixed format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   */
  private escapeUuid(uuid: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw new ForbiddenException(`Invalid tenant_id format: ${uuid}`);
    }
    return uuid;
  }

  /**
   * Validate and escape an array of UUID strings for the tenant_ids session variable.
   */
  private escapeTenantIds(tenants: string[]): string {
    return tenants.map((t) => this.escapeUuid(t)).join(',');
  }
}
