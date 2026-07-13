import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { RequestUser } from '@/modules/auth/interfaces';
import { AuditLogService } from '../audit-log.service';
import { AUDITABLE_KEY, AuditableOptions } from '../decorators/auditable.decorator';
import { AuditAction } from '../audit-log.types';

/** Actions that require fetching "before" state from the database. */
const ACTIONS_WITH_BEFORE_STATE: AuditAction[] = [
  'update',
  'delete',
  'deactivate',
  'activate',
  'role_change',
  'password_reset',
];

/** Maps entityType to the database table name for raw SQL lookups. */
function getTableName(entityType: string): string {
  switch (entityType) {
    case 'tagihan':
      return 'tagihan';
    case 'pembayaran':
      return 'pembayaran';
    case 'user':
      return '"user"';
    case 'role_assignment':
      return '"user"';
    case 'tenant_config':
      return 'tenant';
    default:
      return entityType;
  }
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
    private readonly drizzleService: DrizzleService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions = this.reflector.get<AuditableOptions | undefined>(
      AUDITABLE_KEY,
      context.getHandler(),
    );

    // No @Auditable() decorator — skip audit logic
    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: RequestUser }).user;

    // No authenticated user — skip audit (shouldn't happen on guarded routes)
    if (!user) {
      return next.handle();
    }

    const ip = this.extractIpAddress(request);
    const strictMode = auditOptions.strictMode ?? true;

    // Determine entity ID from source (pre-handler — only available for params/body sources)
    const entityIdPreHandler = this.extractEntityId(auditOptions.entityIdSource, request);

    // Fetch "before" state if the action requires it
    const beforePromise = this.shouldFetchBeforeState(auditOptions.action, entityIdPreHandler)
      ? this.fetchEntityState(auditOptions.entityType, entityIdPreHandler!)
      : Promise.resolve(null);

    return new Observable((subscriber) => {
      beforePromise
        .then((beforeState) => {
          next
            .handle()
            .pipe(
              tap({
                next: async (responseData) => {
                  try {
                    await this.writeAuditLog(
                      auditOptions,
                      user,
                      ip,
                      request,
                      responseData,
                      beforeState,
                    );
                  } catch (error) {
                    if (strictMode) {
                      throw new InternalServerErrorException(
                        'Operasi tidak dapat diselesaikan karena pencatatan audit gagal',
                      );
                    }
                    this.logger.warn(
                      `Audit write failed for ${auditOptions.entityType} (action: ${auditOptions.action}): ${error}`,
                    );
                  }
                },
              }),
            )
            .subscribe({
              next: (value) => subscriber.next(value),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
        })
        .catch((error) => {
          // If fetching before state fails, decide based on strict mode
          if (strictMode) {
            subscriber.error(
              new InternalServerErrorException(
                'Operasi tidak dapat diselesaikan karena pencatatan audit gagal',
              ),
            );
          } else {
            this.logger.warn(
              `Failed to fetch before state for ${auditOptions.entityType}: ${error}`,
            );
            // Continue without audit
            next.handle().subscribe({
              next: (value) => subscriber.next(value),
              error: (err) => subscriber.error(err),
              complete: () => subscriber.complete(),
            });
          }
        });
    });
  }

  /**
   * Write the audit log entry after the handler has executed.
   */
  private async writeAuditLog(
    options: AuditableOptions,
    user: RequestUser,
    ip: string,
    request: Request,
    responseData: unknown,
    beforeState: Record<string, unknown> | null,
  ): Promise<void> {
    // Determine entity ID — may come from response for create operations
    const entityId = this.resolveEntityId(options.entityIdSource, request, responseData);

    if (!entityId) {
      this.logger.warn(
        `Cannot determine entity ID for audit log (entityType: ${options.entityType}, action: ${options.action})`,
      );
      return;
    }

    // Determine tenant ID
    const tenantId = await this.resolveTenantId(options, request, user, beforeState, responseData);

    if (!tenantId) {
      this.logger.warn(
        `Cannot determine tenant ID for audit log (entityType: ${options.entityType}, entityId: ${entityId})`,
      );
      return;
    }

    // Compute before/after values based on action type
    let beforeValues: Record<string, unknown> | null = null;
    let afterValues: Record<string, unknown> | null = null;

    if (options.action === 'create') {
      // Create: no before, after is the response
      afterValues = this.extractValues(responseData);
    } else if (options.action === 'delete') {
      // Delete: before is the entity state, no after
      beforeValues = beforeState;
    } else {
      // Update/deactivate/activate/role_change/password_reset: both before and after
      beforeValues = beforeState;
      afterValues = this.extractValues(responseData);
    }

    // Exclude specified fields
    if (options.excludeFields && options.excludeFields.length > 0) {
      beforeValues = this.removeExcludedFields(beforeValues, options.excludeFields);
      afterValues = this.removeExcludedFields(afterValues, options.excludeFields);
    }

    await this.auditLogService.create({
      action: options.action,
      actorUserId: user.id,
      actorRole: user.role,
      entityType: options.entityType,
      entityId,
      tenantId,
      ipAddress: ip,
      beforeValues,
      afterValues,
    });
  }

  /**
   * Determine whether the "before" state should be fetched.
   */
  private shouldFetchBeforeState(action: AuditAction, entityId: string | null): boolean {
    return ACTIONS_WITH_BEFORE_STATE.includes(action) && entityId !== null;
  }

  /**
   * Fetch the current state of an entity from the database before the operation modifies it.
   */
  private async fetchEntityState(
    entityType: string,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    const tableName = getTableName(entityType);
    const pool = this.drizzleService.getPool();

    try {
      const result = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`, [
        entityId,
      ]);
      return (result.rows[0] as Record<string, unknown>) ?? null;
    } catch (error) {
      this.logger.warn(`Failed to fetch entity state for ${entityType}:${entityId}: ${error}`);
      throw error;
    }
  }

  /**
   * Extract entity ID from the request based on entityIdSource configuration.
   * Returns null for 'response.id' since it's not available pre-handler.
   */
  private extractEntityId(
    source: AuditableOptions['entityIdSource'],
    request: Request,
  ): string | null {
    switch (source) {
      case 'params.id':
        return (request.params?.id as string) ?? null;
      case 'body.id':
        return (request.body?.id as string) ?? null;
      case 'response.id':
        // Not available pre-handler
        return null;
      default:
        return null;
    }
  }

  /**
   * Resolve entity ID post-handler, including from response data.
   */
  private resolveEntityId(
    source: AuditableOptions['entityIdSource'],
    request: Request,
    responseData: unknown,
  ): string | null {
    switch (source) {
      case 'params.id':
        return (request.params?.id as string) ?? null;
      case 'body.id':
        return (request.body?.id as string) ?? null;
      case 'response.id':
        return this.extractIdFromResponse(responseData);
      default:
        return null;
    }
  }

  /**
   * Extract an 'id' field from the response data.
   */
  private extractIdFromResponse(responseData: unknown): string | null {
    if (responseData && typeof responseData === 'object' && 'id' in responseData) {
      return (responseData as Record<string, unknown>).id as string;
    }
    return null;
  }

  /**
   * Resolve the tenant_id based on tenantIdSource configuration.
   */
  private async resolveTenantId(
    options: AuditableOptions,
    request: Request,
    user: RequestUser,
    beforeState: Record<string, unknown> | null,
    responseData: unknown,
  ): Promise<string | null> {
    switch (options.tenantIdSource) {
      case 'body.tenant_id':
        return (request.body?.tenant_id as string) ?? null;

      case 'params.tenantId':
        return (request.params?.tenantId as string) ?? null;

      case 'entity_lookup':
        // Get from the entity's own tenant_id field
        return this.extractTenantIdFromEntity(beforeState, responseData);

      default:
        // Fallback: user's tenant_id, then entity's tenant_id
        if (user.tenant_id) {
          return user.tenant_id;
        }
        return this.extractTenantIdFromEntity(beforeState, responseData);
    }
  }

  /**
   * Extract tenant_id from entity state (before or after).
   */
  private extractTenantIdFromEntity(
    beforeState: Record<string, unknown> | null,
    responseData: unknown,
  ): string | null {
    // Try before state first
    if (beforeState?.tenant_id) {
      return beforeState.tenant_id as string;
    }
    // Try response data
    if (responseData && typeof responseData === 'object') {
      const resp = responseData as Record<string, unknown>;
      if (resp.tenant_id) return resp.tenant_id as string;
      if (resp.tenantId) return resp.tenantId as string;
    }
    return null;
  }

  /**
   * Extract a plain object of values from response data for audit logging.
   */
  private extractValues(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') {
      return null;
    }
    // If it's a class instance or has nested data, serialize to plain object
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Remove excluded fields from a values object.
   */
  private removeExcludedFields(
    values: Record<string, unknown> | null,
    excludeFields: string[],
  ): Record<string, unknown> | null {
    if (!values) return null;
    const filtered = { ...values };
    for (const field of excludeFields) {
      delete filtered[field];
    }
    return filtered;
  }

  /**
   * Extract client IP address from the request.
   * Checks X-Forwarded-For header first (for reverse proxy scenarios),
   * then falls back to req.ip.
   */
  private extractIpAddress(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.toString().split(',')[0]?.trim() || request.ip || 'unknown';
    }
    return request.ip || 'unknown';
  }
}
