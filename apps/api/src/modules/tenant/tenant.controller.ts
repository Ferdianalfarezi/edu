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
import { Role } from '@edu/shared';
import { TenantService, TenantWithStats, CreateTenantResult } from './tenant.service';
import { CreateTenantDto } from './dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

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
   * GET /tenants
   * List all tenants with stats (user count).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listTenants(): Promise<TenantWithStats[]> {
    return this.tenantService.listTenants();
  }
}
