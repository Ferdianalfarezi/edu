import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { KelasService } from './kelas.service';
import { CreateKelasDto, UpdateKelasDto, ListKelasQueryDto } from './dto';

@Controller('kelas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KelasController {
  constructor(private readonly kelasService: KelasService) {}

  /**
   * POST /kelas
   * Create a new class linked to a tahun_ajaran.
   * Optionally assign a wali_kelas (guru).
   */
  @Post()
  async createKelas(@TenantId() tenantId: string, @Body() dto: CreateKelasDto) {
    return this.kelasService.createKelas(tenantId, dto);
  }

  /**
   * GET /kelas
   * List all classes within the tenant.
   * Supports filtering by tahun_ajaran_id and cursor pagination.
   */
  @Get()
  async listKelas(@TenantId() tenantId: string, @Query() query: ListKelasQueryDto) {
    return this.kelasService.listKelas(tenantId, query);
  }

  /**
   * GET /kelas/:id
   * Get class detail with student count.
   */
  @Get(':id')
  async getKelas(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.kelasService.getKelasById(tenantId, id);
  }

  /**
   * PATCH /kelas/:id
   * Update class data (nama, tingkat, wali_kelas, kapasitas).
   */
  @Patch(':id')
  async updateKelas(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKelasDto,
  ) {
    return this.kelasService.updateKelas(tenantId, id, dto);
  }

  /**
   * DELETE /kelas/:id
   * Delete a class only if no active students are enrolled.
   */
  @Delete(':id')
  async deleteKelas(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.kelasService.deleteKelas(tenantId, id);
  }
}
