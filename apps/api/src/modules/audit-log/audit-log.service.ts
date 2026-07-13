import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lte, SQL } from 'drizzle-orm';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { auditLogs } from '@/drizzle/schema/audit-log';
import { paginate } from '@/common/utils/paginate';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { CreateAuditLogDto, AuditLogQueryDto } from './dto';

/** Maximum date range span for audit log queries (365 days in ms). */
const MAX_DATE_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * AuditLogService manages the append-only audit log for sensitive entity operations.
 *
 * Provides:
 * - `create()` — inserts a new immutable audit entry
 * - `findAll()` — filtered, paginated query with tenant scoping for non-SUPER_ADMIN callers
 * - `findOne()` — single entry detail view
 *
 * Requirements: 5.1, 5.4, 5.5, 5.6
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly drizzleService: DrizzleService) {}

  /**
   * Insert a new audit log entry.
   * This is append-only — no update or delete operations exist.
   *
   * Requirements: 5.1, 5.6
   */
  async create(dto: CreateAuditLogDto): Promise<{ id: string }> {
    const db = this.drizzleService.db;

    const [entry] = await db
      .insert(auditLogs)
      .values({
        action: dto.action,
        actorUserId: dto.actorUserId,
        actorRole: dto.actorRole,
        entityType: dto.entityType,
        entityId: dto.entityId,
        tenantId: dto.tenantId,
        ipAddress: dto.ipAddress,
        beforeValues: dto.beforeValues ?? null,
        afterValues: dto.afterValues ?? null,
      })
      .returning({ id: auditLogs.id });

    return { id: entry.id };
  }

  /**
   * Query audit log entries with filtering and offset-based pagination.
   *
   * Supports filters: tenantId, entityType, action, actorUserId, dateFrom, dateTo.
   * Date range is validated to not exceed 365 days.
   *
   * For non-SUPER_ADMIN callers, `callerTenantId` must be provided to scope results.
   * For BENDAHARA callers, `allowedEntityTypes` restricts visible entity types.
   *
   * Requirements: 5.4, 5.5
   */
  async findAll(
    query: AuditLogQueryDto,
    callerTenantId?: string,
    allowedEntityTypes?: string[],
  ): Promise<PaginatedResponse<typeof auditLogs.$inferSelect>> {
    const db = this.drizzleService.db;
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;

    // Validate date range does not exceed 365 days
    if (query.dateFrom && query.dateTo) {
      const from = new Date(query.dateFrom);
      const to = new Date(query.dateTo);
      if (to.getTime() - from.getTime() > MAX_DATE_RANGE_MS) {
        throw new BadRequestException('Rentang tanggal maksimal 365 hari');
      }
    }

    // Build dynamic WHERE conditions
    const conditions: SQL[] = [];

    // Tenant scoping: if callerTenantId is provided (non-SUPER_ADMIN), enforce it
    if (callerTenantId) {
      conditions.push(eq(auditLogs.tenantId, callerTenantId));
    } else if (query.tenantId) {
      // SUPER_ADMIN filtering by specific tenant
      conditions.push(eq(auditLogs.tenantId, query.tenantId));
    }

    if (query.entityType) {
      conditions.push(eq(auditLogs.entityType, query.entityType));
    }

    // Restrict entity types for role-based filtering (e.g., BENDAHARA)
    if (allowedEntityTypes && allowedEntityTypes.length > 0) {
      conditions.push(inArray(auditLogs.entityType, allowedEntityTypes));
    }

    if (query.action) {
      conditions.push(eq(auditLogs.action, query.action));
    }

    if (query.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
    }

    if (query.dateFrom) {
      conditions.push(gte(auditLogs.createdAt, new Date(query.dateFrom)));
    }

    if (query.dateTo) {
      conditions.push(lte(auditLogs.createdAt, new Date(query.dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db.select({ count: count() }).from(auditLogs).where(whereClause);

    const totalCount = countResult?.count ?? 0;

    // Get paginated data
    const offset = (page - 1) * pageSize;
    const items = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    return paginate(items, totalCount, page, pageSize);
  }

  /**
   * Get a single audit log entry by ID.
   *
   * Optionally scoped by callerTenantId for non-SUPER_ADMIN users.
   */
  async findOne(id: string, callerTenantId?: string) {
    const db = this.drizzleService.db;

    const conditions: SQL[] = [eq(auditLogs.id, id)];

    if (callerTenantId) {
      conditions.push(eq(auditLogs.tenantId, callerTenantId));
    }

    const [entry] = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .limit(1);

    if (!entry) {
      throw new NotFoundException('Audit log entry tidak ditemukan');
    }

    return entry;
  }
}
