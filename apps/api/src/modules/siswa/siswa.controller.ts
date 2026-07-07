import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/interfaces';
import { SiswaService } from './siswa.service';
import { CreateSiswaDto, UpdateSiswaDto, SoftDeleteSiswaDto, ListSiswaQueryDto } from './dto';

@Controller('siswa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SiswaController {
  constructor(private readonly siswaService: SiswaService) {}

  /**
   * POST /siswa
   * Create a new student with optional parent linkage.
   * Per ADR-002: checks global phone deduplication for orang_tua.
   */
  @Post()
  @Roles(Role.ADMIN)
  async createSiswa(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: CreateSiswaDto,
  ) {
    return this.siswaService.createSiswa(tenantId, dto, currentUser.id);
  }

  /**
   * GET /siswa
   * List students within tenant. Cursor-paginated.
   * Supports search by name/NISN, filter by kelas/status/tahun_ajaran.
   * Accessible by admin, guru, kepala_sekolah (guru needs for absensi/rapor views).
   */
  @Get()
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async listSiswa(@TenantId() tenantId: string, @Query() query: ListSiswaQueryDto) {
    return this.siswaService.listSiswa(tenantId, query);
  }

  /**
   * GET /siswa/:id
   * Get single student detail.
   * Accessible by admin, guru, kepala_sekolah.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async getSiswa(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.siswaService.getSiswaById(tenantId, id);
  }

  /**
   * PATCH /siswa/:id
   * Update student data.
   */
  @Patch(':id')
  @Roles(Role.ADMIN)
  async updateSiswa(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiswaDto,
  ) {
    return this.siswaService.updateSiswa(tenantId, id, dto);
  }

  /**
   * PATCH /siswa/:id/keluar
   * PATCH /siswa/:id/soft-delete (alias)
   * Soft-delete: mark student as pindah_sekolah or keluar.
   * Records tanggal_keluar, alasan_keluar, processed_by.
   * Checks parent access revocation when all children leave.
   */
  @Patch(':id/keluar')
  @Roles(Role.ADMIN)
  async softDeleteSiswa(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: SoftDeleteSiswaDto,
  ) {
    return this.siswaService.softDeleteSiswa(tenantId, id, dto, currentUser.id);
  }

  @Patch(':id/soft-delete')
  @Roles(Role.ADMIN)
  async softDeleteSiswaAlias(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: SoftDeleteSiswaDto,
  ) {
    return this.siswaService.softDeleteSiswa(tenantId, id, dto, currentUser.id);
  }

  /**
   * POST /siswa/import-csv/preview
   * Preview CSV import: validates and detects conflicts without persisting.
   */
  @Post('import-csv/preview')
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.endsWith('.csv')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Hanya file CSV yang diperbolehkan'), false);
        }
      },
    }),
  )
  async importCsvPreview(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File CSV wajib diupload');
    }
    const csvContent = file.buffer.toString('utf-8');
    return this.siswaService.importCsvPreview(tenantId, csvContent);
  }

  /**
   * POST /siswa/import-csv
   * Execute CSV import with conflict resolutions.
   */
  @Post('import-csv')
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.endsWith('.csv')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Hanya file CSV yang diperbolehkan'), false);
        }
      },
    }),
  )
  async importCsv(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('resolutions') resolutions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File CSV wajib diupload');
    }
    const csvContent = file.buffer.toString('utf-8');
    const parsedResolutions = resolutions ? JSON.parse(resolutions) : [];
    return this.siswaService.importCsvExecute(
      tenantId,
      csvContent,
      currentUser.id,
      parsedResolutions,
    );
  }

  /**
   * POST /siswa/bulk-import
   * CSV upload for bulk student creation with parent phone linkage.
   * CSV format: nama, nisn, jenis_kelamin, tanggal_lahir, orang_tua_nama, orang_tua_phone, kelas_id
   */
  @Post('bulk-import')
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max for CSV
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.endsWith('.csv')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Hanya file CSV yang diperbolehkan'), false);
        }
      },
    }),
  )
  async bulkImport(
    @TenantId() tenantId: string,
    @CurrentUser() currentUser: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File CSV wajib diupload');
    }

    const csvContent = file.buffer.toString('utf-8');
    return this.siswaService.bulkImportSiswa(tenantId, csvContent, currentUser.id);
  }
}
