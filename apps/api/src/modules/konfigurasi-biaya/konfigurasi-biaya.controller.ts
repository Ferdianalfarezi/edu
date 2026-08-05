import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { KonfigurasiBiayaService } from './konfigurasi-biaya.service';
import { UpsertKonfigBiayaDto } from './dto';

/**
 * Controller untuk modul konfigurasi biaya sekolah.
 *
 * Semua endpoint hanya dapat diakses oleh role admin dan bendahara.
 *
 * Endpoints:
 * - GET  /konfigurasi-biaya         — list semua konfigurasi biaya tenant
 * - POST /konfigurasi-biaya         — buat atau update override per siswa/kelas
 * - DELETE /konfigurasi-biaya/:id   — hapus satu override
 *
 * Requirements: 6.1, 6.2, 6.3, 6.6
 */
@Controller('konfigurasi-biaya')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.BENDAHARA)
export class KonfigurasiBiayaController {
  constructor(private readonly konfigurasiBiayaService: KonfigurasiBiayaService) {}

  /**
   * GET /konfigurasi-biaya
   * Kembalikan semua konfigurasi biaya untuk tenant aktif.
   */
  @Get()
  async findAll(@TenantId() tenantId: string) {
    const data = await this.konfigurasiBiayaService.findAll(tenantId);
    return { data };
  }

  /**
   * POST /konfigurasi-biaya
   * Buat atau timpa konfigurasi biaya per siswa/kelas.
   * Jika sudah ada record untuk siswa/kelas yang sama di tenant ini, nominal ditimpa.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async upsert(@TenantId() tenantId: string, @Body() dto: UpsertKonfigBiayaDto) {
    const data = await this.konfigurasiBiayaService.upsert(tenantId, dto);
    return { data };
  }

  /**
   * DELETE /konfigurasi-biaya/:id
   * Hapus satu record konfigurasi biaya berdasarkan id.
   * Returns 404 jika record tidak ditemukan atau bukan milik tenant.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.konfigurasiBiayaService.remove(tenantId, id);
  }
}
