import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { AuditTrailService } from './audit-trail.service';
import { GetAuditTrailQueryDto } from './dto';

/**
 * AuditTrailController — GET /audit-trail
 *
 * Provides read access to the billing audit trail.
 * Accessible by:
 * - bendahara: full access (context: edit operations they perform)
 * - admin: full access (context: edit operations they perform)
 * - kepala_sekolah: read-only view for oversight
 *
 * The endpoint is separate from /tagihan to reflect its cross-cutting audit nature.
 *
 * Requirements: 29.3, 29.4
 */
@Controller('audit-trail')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  /**
   * GET /audit-trail?cursor=&limit=
   * List audit trail entries, cursor-paginated, newest first.
   *
   * Requirements: 29.3, 29.4
   */
  @Get()
  @Roles(Role.BENDAHARA, Role.ADMIN, Role.KEPALA_SEKOLAH)
  async list(@TenantId() tenantId: string, @Query() query: GetAuditTrailQueryDto) {
    return this.auditTrailService.list(tenantId, query);
  }
}
