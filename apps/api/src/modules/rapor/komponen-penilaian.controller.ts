import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { KomponenPenilaianService, KomponenPenilaianResult } from './komponen-penilaian.service';
import { CreateKomponenPenilaianDto, UpdateKomponenPenilaianDto } from './dto';

/**
 * Controller for managing assessment components (komponen penilaian).
 * Only admin role can manage these configurations.
 * Requirements: 36.1–36.6
 */
@Controller('rapor/komponen')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KomponenPenilaianController {
  constructor(private readonly komponenService: KomponenPenilaianService) {}

  /**
   * POST /rapor/komponen
   * Create a new assessment component for the tenant.
   * Requirements: 36.2, 36.4, 36.5
   */
  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateKomponenPenilaianDto,
  ): Promise<KomponenPenilaianResult> {
    return this.komponenService.create(tenantId, dto);
  }

  /**
   * GET /rapor/komponen
   * List all assessment components for the tenant.
   * Requirements: 36.3
   */
  @Get()
  async findAll(@TenantId() tenantId: string): Promise<KomponenPenilaianResult[]> {
    return this.komponenService.findAll(tenantId);
  }

  /**
   * PATCH /rapor/komponen/:id
   * Update an existing assessment component.
   * Requirements: 36.2
   */
  @Patch(':id')
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKomponenPenilaianDto,
  ): Promise<KomponenPenilaianResult> {
    return this.komponenService.update(tenantId, id, dto);
  }

  /**
   * DELETE /rapor/komponen/:id
   * Delete an assessment component if not referenced in rapor_nilai.
   * Requirements: 36.2
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.komponenService.delete(tenantId, id);
  }

  /**
   * POST /rapor/komponen/init-defaults
   * Initialize Kurikulum Merdeka default template.
   * Creates: Pengetahuan (angka 0-100), Keterampilan (angka 0-100), Sikap (huruf), P5 (deskripsi optional).
   * Requirements: 36.1, 36.6
   */
  @Post('init-defaults')
  async initDefaults(@TenantId() tenantId: string): Promise<KomponenPenilaianResult[]> {
    return this.komponenService.initDefaults(tenantId);
  }
}
