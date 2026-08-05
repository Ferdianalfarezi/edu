import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { BarangService, ImportResult } from './barang.service';
import { CreateBarangDto, UpdateBarangDto, ListBarangQueryDto, BarangResponseDto } from './dto';

@Controller('barang')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BarangController {
  constructor(private readonly barangService: BarangService) {}

  /**
   * GET /barang
   * List barang with pagination and search.
   * Accessible by admin, guru, kepala_sekolah.
   */
  @Get()
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListBarangQueryDto,
  ): Promise<PaginatedResponse<BarangResponseDto>> {
    return this.barangService.findAll(tenantId, query);
  }

  /**
   * GET /barang/export
   * Export barang matching filter to XLSX.
   * Accepts same query params as GET /barang (search, kondisi_barang, sumber_dana, kategori).
   * MUST be placed before GET /barang/:id to avoid route conflict.
   * Accessible by admin, kepala_sekolah.
   */
  @Get('export')
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
  async exportXlsx(
    @TenantId() tenantId: string,
    @Query() query: ListBarangQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.barangService.exportToXlsx(query, tenantId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="barang_export.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /**
   * POST /barang/import
   * Import barang from an XLSX file (multipart/form-data, field "file").
   * File size limit: 5 MB.
   * Admin only.
   */
  @Post('import')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importXlsx(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportResult> {
    if (!file) throw new BadRequestException('File wajib diupload');
    return this.barangService.importFromXlsx(file.buffer, tenantId);
  }

  /**
   * GET /barang/:id
   * Get single barang by ID.
   * Accessible by admin, guru, kepala_sekolah.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async getById(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BarangResponseDto> {
    return this.barangService.findOne(tenantId, id);
  }

  /**
   * POST /barang
   * Create a new barang.
   * Admin only.
   */
  @Post()
  @Roles(Role.ADMIN)
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateBarangDto,
  ): Promise<BarangResponseDto> {
    return this.barangService.create(tenantId, dto);
  }

  /**
   * PATCH /barang/:id
   * Update an existing barang.
   * Admin only.
   */
  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBarangDto,
  ): Promise<BarangResponseDto> {
    return this.barangService.update(tenantId, id, dto);
  }

  /**
   * DELETE /barang/:id
   * Soft delete a barang (sets deleted_at).
   * Admin only.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.barangService.remove(tenantId, id);
    return { message: 'Barang berhasil dihapus' };
  }
}
