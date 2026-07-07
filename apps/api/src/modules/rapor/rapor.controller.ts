import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RaporNilaiService } from './rapor-nilai.service';
import { RaporOverviewService } from './rapor-overview.service';
import { RaporFinalizationService } from './rapor-finalization.service';
import { RaporExportService } from './rapor-export.service';
import { RaporWaliService } from './rapor-wali.service';
import {
  InputNilaiDto,
  GetRaporOverviewQueryDto,
  FinalizeRaporDto,
  ExportRaporQueryDto,
  SaveCatatanDto,
} from './dto';

/**
 * Rapor Controller — Grade input endpoints for guru + finalization for wali kelas + overview for kepala_sekolah.
 * Admin Panel only (not mobile).
 *
 * Requirements: 37.1–37.10, 38.1–38.12, 40.1–40.4
 */
@Controller('rapor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RaporController {
  constructor(
    private readonly raporNilaiService: RaporNilaiService,
    private readonly raporOverviewService: RaporOverviewService,
    private readonly raporFinalizationService: RaporFinalizationService,
    private readonly raporExportService: RaporExportService,
    private readonly raporWaliService: RaporWaliService,
  ) {}

  /**
   * GET /rapor/kelas-wali
   * Returns the kelas assigned to the current guru as wali kelas.
   */
  @Get('kelas-wali')
  @Roles(Role.GURU)
  async getKelasWali(@TenantId() tenantId: string, @CurrentUser('id') guruId: string) {
    const data = await this.raporWaliService.getKelasWali(tenantId, guruId);
    return { data };
  }

  /**
   * GET /rapor/kelas
   * Returns classes for a specific mapel that the guru teaches.
   * Query: ?mapel_id=UUID
   */
  @Get('kelas')
  @Roles(Role.GURU)
  async getKelasByMapel(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Query('mapel_id') mapelId: string,
  ) {
    const data = await this.raporWaliService.getKelasByMapel(tenantId, guruId, mapelId);
    return { data };
  }

  /**
   * GET /rapor/nilai
   * Returns student grades for a specific kelas, mapel, and periode.
   * Query: ?kelas_id=&mapel_id=&periode_rapor_id=
   */
  @Get('nilai')
  @Roles(Role.GURU)
  async getNilai(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Query('kelas_id') kelasId: string,
    @Query('mapel_id') mapelId: string,
    @Query('periode_rapor_id') periodeId: string,
  ) {
    const data = await this.raporNilaiService.getKelasGrades(
      tenantId,
      guruId,
      kelasId,
      mapelId,
      periodeId,
    );
    return { data };
  }

  /**
   * GET /rapor/finalize-overview
   * Returns overview data for the finalization page:
   * - mapel submission status per kelas
   * - student grades summary
   * - rapor finalization status
   * Query: ?kelas_id=&periode_id=
   */
  @Get('finalize-overview')
  @Roles(Role.GURU)
  async getFinalizeOverview(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Query('kelas_id') kelasId: string,
    @Query('periode_id') periodeId: string,
  ) {
    const data = await this.raporWaliService.getFinalizeOverview(
      tenantId,
      userId,
      kelasId,
      periodeId,
    );
    return { data };
  }

  /**
   * GET /rapor/mata-pelajaran
   * Returns subjects assigned to the guru via jadwal in active tahun_ajaran.
   * Response: [{ mapel_id, mapel_nama, kelas: [{ kelas_id, kelas_nama }] }]
   *
   * Requirements: 37.1, 37.9
   */
  @Get('mata-pelajaran')
  @Roles(Role.GURU)
  async getGuruMapel(@TenantId() tenantId: string, @CurrentUser('id') guruId: string) {
    const data = await this.raporNilaiService.getGuruMapel(tenantId, guruId);
    return { data };
  }

  /**
   * GET /rapor/kelas/:kelasId/mapel/:mapelId/periode/:periodeId
   * Returns student list with existing grades (if any).
   * Validates guru is assigned to this mapel+kelas via jadwal.
   *
   * Requirements: 37.1, 37.2
   */
  @Get('kelas/:kelasId/mapel/:mapelId/periode/:periodeId')
  @Roles(Role.GURU)
  async getKelasGrades(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Param('kelasId') kelasId: string,
    @Param('mapelId') mapelId: string,
    @Param('periodeId') periodeId: string,
  ) {
    const data = await this.raporNilaiService.getKelasGrades(
      tenantId,
      guruId,
      kelasId,
      mapelId,
      periodeId,
    );
    return { data };
  }

  /**
   * POST /rapor/nilai/catatan
   * Save wali kelas notes (catatan) for students in a kelas/periode.
   */
  @Post('nilai/catatan')
  @Roles(Role.GURU)
  async saveCatatan(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SaveCatatanDto,
  ) {
    const result = await this.raporWaliService.saveCatatan(tenantId, userId, dto);
    return {
      message: 'Catatan berhasil disimpan',
      data: result,
    };
  }

  /**
   * POST /rapor/nilai
   * Save grades (draft or submitted). Validate skala, partial save allowed.
   * body: { kelas_id, mata_pelajaran_id, periode_rapor_id, nilai: [...], status }
   *
   * Requirements: 37.3–37.9
   */
  @Post('nilai')
  @Roles(Role.GURU)
  async saveNilai(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Body() dto: InputNilaiDto,
  ) {
    const result = await this.raporNilaiService.saveNilai(tenantId, guruId, dto);
    return {
      message:
        dto.status === 'submitted'
          ? 'Nilai berhasil dikirim'
          : 'Nilai berhasil disimpan sebagai draft',
      data: result,
    };
  }

  /**
   * GET /rapor/overview
   * Returns all rapor records (draft + final) with status indicator.
   * Admin and Kepala sekolah — read-only view across all classes.
   * Filters: kelas_id, periode, tahun_ajaran_id (all optional).
   * Defaults to active tahun_ajaran if tahun_ajaran_id not provided.
   *
   * Requirements: 38.11, 38.12
   */
  @Get('overview')
  @Roles(Role.KEPALA_SEKOLAH, Role.ADMIN)
  async getOverview(@TenantId() tenantId: string, @Query() query: GetRaporOverviewQueryDto) {
    const data = await this.raporOverviewService.getOverview(tenantId, query);
    return { data };
  }

  /**
   * GET /rapor/view
   * Returns detailed rapor data for a specific kelas and periode.
   * Includes overview info and per-siswa grades.
   * Admin and Kepala sekolah only.
   *
   * Query: ?kelas_id=UUID&periode_id=string
   */
  @Get('view')
  @Roles(Role.KEPALA_SEKOLAH, Role.ADMIN)
  async getRaporView(
    @TenantId() tenantId: string,
    @Query('kelas_id') kelasId: string,
    @Query('periode_id') periodeId: string,
  ) {
    const data = await this.raporOverviewService.getRaporView(tenantId, kelasId, periodeId);
    return { data };
  }

  /**
   * POST /rapor/kelas/:kelasId/periode/:periodeId/finalize
   * Finalize rapor: validate all mapel submitted, calculate rankings, set status='final'.
   * Only wali kelas of the class can finalize.
   *
   * Requirements: 38.1–38.10
   */
  @Post('kelas/:kelasId/periode/:periodeId/finalize')
  @Roles(Role.GURU)
  async finalizeRapor(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('kelasId') kelasId: string,
    @Param('periodeId') periodeId: string,
    @Body() dto: FinalizeRaporDto,
  ) {
    const result = await this.raporFinalizationService.finalizeRapor(
      tenantId,
      userId,
      kelasId,
      periodeId,
      dto,
    );
    return {
      message: 'Rapor berhasil difinalkan',
      data: result,
    };
  }

  /**
   * POST /rapor/kelas/:kelasId/periode/:periodeId/revert
   * Revert rapor to draft. Only wali kelas can revert.
   * After revert, rapor is no longer visible to parents.
   *
   * Requirements: 38.9
   */
  @Post('kelas/:kelasId/periode/:periodeId/revert')
  @Roles(Role.GURU)
  async revertRapor(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Param('kelasId') kelasId: string,
    @Param('periodeId') periodeId: string,
  ) {
    const result = await this.raporFinalizationService.revertRapor(
      tenantId,
      userId,
      kelasId,
      periodeId,
    );
    return {
      message: 'Rapor berhasil dikembalikan ke status draft',
      data: result,
    };
  }

  /**
   * GET /rapor/export
   * Export rapor per kelas per periode as Excel file.
   * Only allows export of finalized rapor.
   * Enqueues to Bull EXPORT queue and returns job_id.
   * Admin only.
   *
   * Requirements: 40.1–40.4
   */
  @Get('export')
  @Roles(Role.ADMIN)
  async exportRapor(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ExportRaporQueryDto,
  ) {
    return this.raporExportService.exportRapor(tenantId, userId, query);
  }
}
