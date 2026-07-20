import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, switchMap, tap, finalize } from 'rxjs';
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

    // Super admin: check for X-Tenant-Context header to optionally scope to a tenant
    if (user.role === Role.SUPER_ADMIN) {
      const tenantContext = request.headers['x-tenant-context'] as string | undefined;
      if (tenantContext) {
        return this.executeWithSuperAdminTenantContext(request, tenantContext, next);
      }

      // For POST (create) without tenant context, require tenant_id in body
      // unless the route is exempt (e.g., /tenants, /auth, or operating on existing entity)
      if (request.method === 'POST') {
        const url = request.originalUrl || request.url;
        if (!this.isExemptFromTenantIdCheck(url) && !request.body?.tenant_id) {
          throw new BadRequestException(
            'tenant_id wajib disertakan untuk operasi create oleh Superadmin',
          );
        }
      }

      // No header: bypass RLS entirely (cross-tenant access)
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
    let released = false;

    const safeCommitAndRelease = async () => {
      if (released) return;
      released = true;
      await this.commitAndRelease(client);
    };

    const safeRollbackAndRelease = async () => {
      if (released) return;
      released = true;
      await this.rollbackAndRelease(client);
    };

    return from(this.acquireAndSetTenant(request, user)).pipe(
      switchMap((poolClient) => {
        client = poolClient;
        return next.handle();
      }),
      tap({
        next: () => {
          // On success: commit transaction and release client
          safeCommitAndRelease();
        },
        error: () => {
          // On error: rollback transaction and release client
          safeRollbackAndRelease();
        },
      }),
      // Safety net: if observable is unsubscribed (e.g. client disconnect)
      // without emitting next or error, ensure we still release the connection.
      finalize(() => {
        if (!released && client) {
          this.rollbackAndRelease(client);
          released = true;
        }
      }),
    );
  }

  private executeWithSuperAdminTenantContext(
    request: Request,
    tenantContext: string,
    next: CallHandler,
  ): Observable<unknown> {
    let client: PoolClient;
    let released = false;

    const safeCommitAndRelease = async () => {
      if (released) return;
      released = true;
      await this.commitAndRelease(client);
    };

    const safeRollbackAndRelease = async () => {
      if (released) return;
      released = true;
      await this.rollbackAndRelease(client);
    };

    return from(this.acquireAndSetSuperAdminTenantContext(request, tenantContext)).pipe(
      switchMap((poolClient) => {
        client = poolClient;
        return next.handle();
      }),
      tap({
        next: () => {
          safeCommitAndRelease();
        },
        error: () => {
          safeRollbackAndRelease();
        },
      }),
      finalize(() => {
        if (!released && client) {
          this.rollbackAndRelease(client);
          released = true;
        }
      }),
    );
  }

  private async acquireAndSetSuperAdminTenantContext(
    request: Request,
    tenantContext: string,
  ): Promise<PoolClient> {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantContext)) {
      throw new BadRequestException('Tenant tidak tersedia atau tidak aktif');
    }

    const pool = this.drizzleService.getPool();

    // Verify tenant exists and is active
    const tenantResult = await pool.query(
      `SELECT id, is_active FROM tenant WHERE id = $1 LIMIT 1`,
      [tenantContext],
    );
    if (!tenantResult.rows[0] || !tenantResult.rows[0].is_active) {
      throw new BadRequestException('Tenant tidak tersedia atau tidak aktif');
    }

    // Acquire pool client and set tenant context
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      try {
        await client.query(`SET LOCAL app.tenant_id = '${tenantContext}'`);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignore rollback errors
        }
        client.release();
        this.logger.error(`Failed to SET LOCAL for super admin tenant context: ${error}`);
        throw new InternalServerErrorException('Konteks tenant tidak dapat disiapkan');
      }

      // Store the tenant-scoped client on the request for downstream use
      (request as unknown as Record<string, unknown>)[TENANT_CLIENT_KEY] = client;

      return client;
    } catch (error) {
      // Re-throw known HTTP exceptions
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      // If setup fails, rollback and release immediately
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }
      client.release();
      this.logger.error(`Failed to set super admin tenant context: ${error}`);
      throw error;
    }
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

  /**
   * Routes that are exempt from the tenant_id body requirement for SUPER_ADMIN POST requests.
   * - /tenants: creating a tenant itself doesn't need tenant_id
   * - /auth: authentication endpoints
   * - URLs containing a UUID path segment: operating on existing entities (e.g., /users/:id/reset-password)
   */
  private isExemptFromTenantIdCheck(url: string): boolean {
    // Strip query params for cleaner matching
    const path = url.split('?')[0];

    // Exempt known route prefixes (with or without /api/v1 prefix)
    const normalizedPath = path.replace(/^\/api\/v\d+/, '');
    if (normalizedPath.startsWith('/tenants') || normalizedPath.startsWith('/auth')) {
      return true;
    }

    // Exempt routes that contain a UUID segment (operating on existing entities, not creating new ones)
    const uuidPattern = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    if (uuidPattern.test(path)) {
      return true;
    }

    return false;
  }
}
