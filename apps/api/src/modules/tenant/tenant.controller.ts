import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { Role } from '@edu/shared';
import { Auditable, AuditInterceptor } from '@/modules/audit-log';
import { TenantService, CreateTenantResult, TenantStats } from './tenant.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * GET /tenants/search?q=
   * Search tenants by name for the context switcher (SUPER_ADMIN only).
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async searchTenants(@Query('q') query: string) {
    if (!query || query.length < 1) {
      throw new BadRequestException('Query parameter q harus minimal 1 karakter');
    }
    return this.tenantService.searchTenants(query);
  }

  /**
   * GET /tenants/stats
   * Get stats for the current user's tenant (admin dashboard).
   */
  @Get('stats')
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
  @HttpCode(HttpStatus.OK)
  async getTenantStats(@TenantId() tenantId: string): Promise<TenantStats> {
    return this.tenantService.getTenantStats(tenantId);
  }

  /**
   * POST /tenants
   * Create a new tenant (school) with a default admin user.
   * Sends credentials email to the admin.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'tenant_config',
    action: 'create',
    entityIdSource: 'response.id',
    strictMode: false,
  })
  async createTenant(@Body() dto: CreateTenantDto): Promise<CreateTenantResult> {
    return this.tenantService.createTenant(dto);
  }

  /**
   * PATCH /tenants/:id/deactivate
   * Deactivate a tenant and invalidate all user tokens.
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'tenant_config',
    action: 'deactivate',
    entityIdSource: 'params.id',
    strictMode: false,
  })
  async deactivateTenant(@Param('id') id: string): Promise<{ message: string }> {
    return this.tenantService.deactivateTenant(id);
  }

  /**
   * PATCH /tenants/:id/activate
   * Reactivate a previously deactivated tenant.
   */
  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'tenant_config',
    action: 'activate',
    entityIdSource: 'params.id',
    strictMode: false,
  })
  async activateTenant(@Param('id') id: string): Promise<{ message: string }> {
    return this.tenantService.activateTenant(id);
  }

  /**
   * PATCH /tenants/:id
   * Update tenant details (nama, alamat, telepon, email).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'tenant_config',
    action: 'update',
    entityIdSource: 'params.id',
    strictMode: false,
  })
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<{ message: string }> {
    return this.tenantService.updateTenant(id, dto);
  }

  /**
   * DELETE /tenants/:id
   * Tenant deletion is prohibited. Use deactivate instead.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.BAD_REQUEST)
  async deleteTenant(@Param('id') _id: string) {
    throw new BadRequestException(
      'Penghapusan tenant tidak diperbolehkan. Gunakan deactivate sebagai gantinya.',
    );
  }

  /**
   * GET /tenants
   * List all tenants with stats (user count), paginated.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listTenants(@Query() query: PaginationQueryDto) {
    return this.tenantService.listTenantsPaginated(query.page, query.page_size);
  }
}
