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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { Role } from '@edu/shared';
import { Auditable, AuditInterceptor } from '@/modules/audit-log';
import { StorageService } from '@/modules/storage/storage.service';
import { TenantService, CreateTenantResult, TenantStats, GenderStats } from './tenant.service';
import { CreateTenantDto, UpdateHariKerjaDto, UpdateTenantDto } from './dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly storageService: StorageService,
  ) {}

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
   * GET /tenants/stats/gender
   * Jumlah siswa aktif laki-laki/perempuan: total + per kelas (dashboard admin).
   */
  @Get('stats/gender')
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
  @HttpCode(HttpStatus.OK)
  async getGenderStats(@TenantId() tenantId: string): Promise<GenderStats> {
    return this.tenantService.getGenderStats(tenantId);
  }

  /**
   * GET /tenants/profile
   * Get tenant profile (id, nama, jumlah_tingkat) for the current user's tenant.
   */
  @Get('profile')
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH, Role.BENDAHARA, Role.GURU)
  @HttpCode(HttpStatus.OK)
  async getTenantProfile(@TenantId() tenantId: string) {
    return this.tenantService.getTenantProfile(tenantId);
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
   * PATCH /tenants/hari-kerja
   * Update the hari_kerja setting for the current user's tenant.
   */
  @Patch('hari-kerja')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateHariKerja(
    @TenantId() tenantId: string,
    @Body() dto: UpdateHariKerjaDto,
  ): Promise<{ message: string }> {
    return this.tenantService.updateHariKerja(tenantId, dto.hari_kerja);
  }

  /**
   * PATCH /tenants/:id/logo
   * Upload or replace the school logo for a tenant.
   * Accepts multipart/form-data with field "file" (JPEG, PNG, WebP, ≤ 2 MB).
   * Validates MIME type via Sharp (not just Multer Content-Type header).
   * Resizes to max 512×512 WebP and uploads to S3.
   * Returns the updated tenant record with the new logo_url.
   *
   * Requirements: 1.1, 1.2, 1.3, 1.4
   */
  @Patch(':id/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ id: string; logo_url: string }> {
    if (!file) {
      throw new BadRequestException('File wajib diupload.');
    }
    const publicUrl = await this.storageService.uploadLogo(id, file);
    return this.tenantService.updateLogoUrl(id, publicUrl);
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
