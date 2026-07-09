import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
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
   * Return all config keys for tenant as structured data.
   * Response: { data: { batas_ketidakhadiran_notifikasi, nominal_spp, tanggal_jatuh_tempo, ... } }
   */
  @Get()
  async getAllConfig(@TenantId() tenantId: string) {
    const items = await this.konfigurasiService.getAllConfig(tenantId);
    // Convert array of {key, value} to structured object for frontend
    const data: Record<string, any> = {};
    for (const item of items) {
      data[item.key] = item.value;
    }
    return { data };
  }

  /**
   * PATCH /konfigurasi
   * Bulk upsert config keys. Accepts either:
   * - { items: [{ key, value }, ...] } (standard DTO)
   * - { key1: value1, key2: value2, ... } (flat object from frontend)
   */
  @Patch()
  @HttpCode(HttpStatus.OK)
  async bulkUpsertConfig(@TenantId() tenantId: string, @Body() body: any) {
    // Support both formats: { items: [...] } and flat object
    let items: { key: string; value: any }[];
    if (body.items && Array.isArray(body.items)) {
      items = body.items;
    } else {
      // Flat object: convert to items array
      items = Object.entries(body).map(([key, value]) => ({ key, value }));
    }
    const result = await this.konfigurasiService.bulkUpsertConfig(tenantId, items);
    // Return structured data
    const data: Record<string, any> = {};
    for (const item of result) {
      data[item.key] = item.value;
    }
    return { data };
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
