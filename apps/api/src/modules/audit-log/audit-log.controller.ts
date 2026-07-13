import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RequestUser } from '@/modules/auth/interfaces';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto';

/** Allowed entity types for BENDAHARA role audit log access. */
const BENDAHARA_ALLOWED_ENTITY_TYPES = ['tagihan', 'pembayaran'] as const;

/**
 * AuditLogController exposes audit log list and detail endpoints.
 *
 * Access control:
 * - SUPER_ADMIN: full access, no tenant scoping
 * - ADMIN: scoped to own tenant, all entity types
 * - BENDAHARA: scoped to own tenant, restricted to tagihan and pembayaran entity types
 *
 * Requirements: 5.4, 5.5, 6.1, 6.4
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.BENDAHARA)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * GET /audit-logs — List audit log entries with filtering and pagination.
   *
   * - SUPER_ADMIN: no tenant scoping, no entity type restriction
   * - ADMIN: auto-scoped to their tenant
   * - BENDAHARA: auto-scoped to their tenant + restricted to tagihan/pembayaran
   */
  @Get()
  async findAll(@Query() query: AuditLogQueryDto, @Req() req: Request) {
    const user = req.user as RequestUser;

    const callerTenantId =
      user.role === Role.SUPER_ADMIN ? undefined : (user.tenant_id ?? undefined);

    // Determine allowed entity types based on role
    let allowedEntityTypes: string[] | undefined;

    if (user.role === Role.BENDAHARA) {
      // If BENDAHARA specifies an invalid entity type, return empty result
      if (
        query.entityType &&
        !BENDAHARA_ALLOWED_ENTITY_TYPES.includes(
          query.entityType as (typeof BENDAHARA_ALLOWED_ENTITY_TYPES)[number],
        )
      ) {
        return {
          data: [],
          meta: {
            page: query.page ?? 1,
            page_size: query.page_size ?? 20,
            total_count: 0,
            total_pages: 0,
          },
        };
      }

      // If no entity type specified, restrict to allowed types
      if (!query.entityType) {
        allowedEntityTypes = [...BENDAHARA_ALLOWED_ENTITY_TYPES];
      }
    }

    return this.auditLogService.findAll(query, callerTenantId, allowedEntityTypes);
  }

  /**
   * GET /audit-logs/:id — Get a single audit log entry detail.
   *
   * - SUPER_ADMIN: no tenant scoping
   * - ADMIN: scoped to own tenant
   * - BENDAHARA: scoped to own tenant + entity type must be tagihan or pembayaran
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const user = req.user as RequestUser;

    const callerTenantId =
      user.role === Role.SUPER_ADMIN ? undefined : (user.tenant_id ?? undefined);

    const entry = await this.auditLogService.findOne(id, callerTenantId);

    // BENDAHARA can only view tagihan/pembayaran entries
    if (
      user.role === Role.BENDAHARA &&
      !BENDAHARA_ALLOWED_ENTITY_TYPES.includes(
        entry.entityType as (typeof BENDAHARA_ALLOWED_ENTITY_TYPES)[number],
      )
    ) {
      throw new NotFoundException('Audit log entry tidak ditemukan');
    }

    return entry;
  }
}
