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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RppService } from './rpp.service';
import { CreateRppDto, UpdateRppDto, GetRppQueryDto } from './dto';

/**
 * RPP Controller — CRUD and portal endpoints for RPP/Modul Ajar.
 * Create, edit, delete: guru only.
 * Portal (list, detail, download): guru, kepala_sekolah, admin.
 *
 * Requirements: 41.1–41.11, 42.1–42.6, 43.1–43.7
 */
@Controller('rpp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RppController {
  constructor(private readonly rppService: RppService) {}

  /**
   * GET /rpp/kategori
   * List all RPP categories for the tenant.
   */
  @Get('kategori')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async listKategori(@TenantId() tenantId: string) {
    const data = await this.rppService.listKategori(tenantId);
    return { data };
  }

  /**
   * GET /rpp
   * List published RPP in the same tenant (portal view).
   * Cursor-paginated, sorted by tanggal_publish DESC.
   * Filters: kategori, mapel, tahun; text search by judul.
   * Accessible by guru, kepala_sekolah, admin.
   *
   * Requirements: 43.1, 43.2, 43.3, 43.6, 43.7
   */
  @Get()
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async list(@TenantId() tenantId: string, @Query() query: GetRppQueryDto) {
    return this.rppService.list(tenantId, query);
  }

  /**
   * POST /rpp
   * Create a new RPP. Supports both multipart/form-data (file upload) and JSON body (rich text).
   * File upload: PDF/DOC/DOCX/PPT/PPTX, max 10MB.
   * Required fields: judul, mata_pelajaran_id, kategori, tahun_terbit, konten_type, status.
   *
   * Requirements: 41.1–41.10
   */
  @Post()
  @Roles(Role.GURU)
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Body() dto: CreateRppDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.rppService.create(tenantId, guruId, dto, file);
    return {
      message:
        dto.status === 'published'
          ? 'RPP berhasil dipublish'
          : 'RPP berhasil disimpan sebagai draft',
      data: result,
    };
  }

  /**
   * PATCH /rpp/:id
   * Update an existing RPP. Only the creator can edit.
   * Can change status (published → draft hides from portal).
   * Supports file replacement via multipart/form-data.
   *
   * Requirements: 42.1, 42.2, 42.3
   */
  @Patch(':id')
  @Roles(Role.GURU)
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Param('id', ParseUUIDPipe) rppId: string,
    @Body() dto: UpdateRppDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.rppService.update(tenantId, guruId, rppId, dto, file);
    return {
      message: 'RPP berhasil diperbarui',
      data: result,
    };
  }

  /**
   * DELETE /rpp/:id
   * Delete an RPP permanently. Only the creator can delete.
   * Removes file from R2 and all favorit references.
   *
   * Requirements: 42.4, 42.5, 42.6
   */
  @Delete(':id')
  @Roles(Role.GURU)
  async delete(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Param('id', ParseUUIDPipe) rppId: string,
  ) {
    await this.rppService.delete(tenantId, guruId, rppId);
    return { message: 'RPP berhasil dihapus' };
  }

  /**
   * POST /rpp/:id/favorite
   * Toggle favorite status for the logged-in guru on a published RPP.
   * If already favorited → removes it. If not → adds it.
   * Returns { favorited: boolean } indicating the new state.
   *
   * Requirements: 44.1, 44.2, 44.4
   */
  @Post(':id/favorite')
  @Roles(Role.GURU)
  async toggleFavorite(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Param('id', ParseUUIDPipe) rppId: string,
  ) {
    const result = await this.rppService.toggleFavorite(tenantId, guruId, rppId);
    return {
      message: result.favorited ? 'RPP ditambahkan ke favorit' : 'RPP dihapus dari favorit',
      data: result,
    };
  }

  /**
   * GET /rpp/favorit
   * List all favorited RPP for the logged-in guru.
   * Only shows RPP with status='published' (hides reverted/draft RPP).
   *
   * Requirements: 44.3, 44.5
   */
  @Get('favorit')
  @Roles(Role.GURU)
  async listFavorites(@TenantId() tenantId: string, @CurrentUser('id') guruId: string) {
    const data = await this.rppService.listFavorites(tenantId, guruId);
    return { data };
  }

  /**
   * GET /rpp/:id/download
   * Returns presigned URL (5-min expiry) for file-type RPP,
   * or throws error for richtext RPP (PDF generation not yet implemented).
   * Accessible by guru, kepala_sekolah, admin.
   *
   * Requirements: 43.5
   */
  @Get(':id/download')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async download(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) rppId: string) {
    const result = await this.rppService.getDownloadUrl(tenantId, rppId);
    return { data: result };
  }

  /**
   * GET /rpp/:id
   * Full detail view of a single RPP.
   * Returns konten for richtext, file info for file type.
   * Accessible by guru, kepala_sekolah, admin.
   *
   * Requirements: 43.4
   */
  @Get(':id')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async getDetail(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) rppId: string) {
    const data = await this.rppService.getDetail(tenantId, rppId);
    return { data };
  }
}
