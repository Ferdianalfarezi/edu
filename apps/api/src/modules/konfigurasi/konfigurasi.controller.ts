import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { KonfigurasiService, KonfigurasiItem } from './konfigurasi.service';
import { UpsertKonfigurasiDto } from './dto';

@Controller('konfigurasi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
export class KonfigurasiController {
  constructor(private readonly konfigurasiService: KonfigurasiService) {}

  /**
   * GET /konfigurasi
   * Return all config keys for tenant with defaults applied for missing keys.
   */
  @Get()
  async getAllConfig(@TenantId() tenantId: string): Promise<KonfigurasiItem[]> {
    return this.konfigurasiService.getAllConfig(tenantId);
  }

  /**
   * GET /konfigurasi/:key
   * Get a single config value (with default fallback).
   */
  @Get(':key')
  async getConfigByKey(
    @TenantId() tenantId: string,
    @Param('key') key: string,
  ): Promise<KonfigurasiItem> {
    return this.konfigurasiService.getConfigByKey(tenantId, key);
  }

  /**
   * PUT /konfigurasi/:key
   * Upsert config value (INSERT ON CONFLICT UPDATE).
   */
  @Put(':key')
  @HttpCode(HttpStatus.OK)
  async upsertConfig(
    @TenantId() tenantId: string,
    @Param('key') key: string,
    @Body() dto: UpsertKonfigurasiDto,
  ): Promise<KonfigurasiItem> {
    return this.konfigurasiService.upsertConfig(tenantId, key, dto.value);
  }
}
