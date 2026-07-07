import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { Role } from '@edu/shared';
import { TenantService, TenantWithStats, CreateTenantResult, TenantStats } from './tenant.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

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
  async createTenant(@Body() dto: CreateTenantDto): Promise<CreateTenantResult> {
    return this.tenantService.createTenant(dto);
  }

  /**
   * PATCH /tenants/:id/deactivate
   * Deactivate a tenant and invalidate all user tokens.
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateTenant(@Param('id') id: string): Promise<{ message: string }> {
    return this.tenantService.deactivateTenant(id);
  }

  /**
   * PATCH /tenants/:id/activate
   * Reactivate a previously deactivated tenant.
   */
  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activateTenant(@Param('id') id: string): Promise<{ message: string }> {
    return this.tenantService.activateTenant(id);
  }

  /**
   * PATCH /tenants/:id
   * Update tenant details (nama, alamat, telepon, email).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<{ message: string }> {
    return this.tenantService.updateTenant(id, dto);
  }

  /**
   * GET /tenants
   * List all tenants with stats (user count).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listTenants(): Promise<TenantWithStats[]> {
    return this.tenantService.listTenants();
  }
}
