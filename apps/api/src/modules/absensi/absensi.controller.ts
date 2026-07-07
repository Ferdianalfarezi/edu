import {
  Body,
  Controller,
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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/interfaces';
import { AbsensiService } from './absensi.service';
import {
  CreateAbsensiDto,
  UpdateAbsensiDto,
  GetAbsensiAnakQueryDto,
  RekapAbsensiQueryDto,
  ExportRekapAbsensiQueryDto,
  SyncAbsensiDto,
} from './dto';

@Controller('absensi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbsensiController {
  constructor(private readonly absensiService: AbsensiService) {}

  /**
   * GET /absensi/kelas-hari-ini
   * Returns the guru's scheduled classes for today.
   * Used by mobile app to show which classes need attendance input.
   *
   * Requirements: 1.1, 1.12
   */
  @Get('kelas-hari-ini')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH)
  async getKelasHariIni(@TenantId() tenantId: string, @CurrentUser('id') guruId: string) {
    return this.absensiService.getKelasHariIni(tenantId, guruId);
  }

  /**
   * GET /absensi/dashboard
   *
   * Returns today's attendance summary per class and alpa alert list.
   * Kepala_sekolah only.
   *
   * Requirements: 5.1, 5.2, 5.3
   */
  @Get('dashboard')
  @Roles(Role.KEPALA_SEKOLAH)
  async getDashboard(@TenantId() tenantId: string) {
    return this.absensiService.getDashboard(tenantId);
  }

  /**
   * GET /absensi/rekap?kelas_id=&bulan=&tahun=&periode=bulanan|semester
   *
   * Returns attendance recap per student for a given period.
   * Includes: hadir, izin, sakit, alpa counts, total_hari_efektif, persentase_kehadiran.
   * Accessible by kepala_sekolah and admin.
   *
   * Requirements: 4.1–4.7
   */
  @Get('rekap')
  @Roles(Role.KEPALA_SEKOLAH, Role.ADMIN)
  async getRekapAbsensi(@TenantId() tenantId: string, @Query() query: RekapAbsensiQueryDto) {
    return this.absensiService.getRekapAbsensi(tenantId, query);
  }

  /**
   * GET /absensi/rekap/export?kelas_id=&bulan=&tahun=&periode=bulanan|semester&format=xlsx
   *
   * Enqueues a rekap absensi export job to the EXPORT Bull queue.
   * Returns { job_id, message } immediately (async processing).
   * Accessible by kepala_sekolah and admin.
   *
   * Requirements: 4.4
   */
  @Get('rekap/export')
  @Roles(Role.KEPALA_SEKOLAH, Role.ADMIN)
  async exportRekapAbsensi(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Query() query: ExportRekapAbsensiQueryDto,
  ) {
    return this.absensiService.exportRekapAbsensi(tenantId, userId, query);
  }

  /**
   * GET /absensi/kelas/:kelasId/tanggal/:tanggal
   *
   * Returns attendance data for a class on a specific date.
   * Accessible by guru (all classes, read-only for non-assigned) and kepala_sekolah.
   *
   * Requirements: 3.1, 3.2, 3.3
   */
  @Get('kelas/:kelasId/tanggal/:tanggal')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH)
  async getAbsensiByKelasAndTanggal(
    @TenantId() tenantId: string,
    @Param('kelasId', ParseUUIDPipe) kelasId: string,
    @Param('tanggal') tanggal: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.absensiService.getAbsensiByKelasAndTanggal(
      tenantId,
      kelasId,
      tanggal,
      user.id,
      user.role,
    );
  }

  /**
   * POST /absensi/kelas/:kelasId
   * Create daily attendance for a class.
   * Validates all students covered, guru authorized via jadwal/pengganti.
   * Uses batch INSERT with ON CONFLICT DO NOTHING.
   * Emits ONE batch notification job per class.
   *
   * Requirements: 1.1–1.14
   */
  @Post('kelas/:kelasId')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH)
  async createAbsensi(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Param('kelasId', ParseUUIDPipe) kelasId: string,
    @Body() dto: CreateAbsensiDto,
  ) {
    return this.absensiService.createAbsensi(tenantId, guruId, kelasId, dto);
  }

  /**
   * PATCH /absensi/:absensiId
   * Edit an attendance record's status.
   *
   * Authorization:
   * - Kepala_sekolah can edit ANY class's attendance (Req 2.4)
   * - Guru can edit IF scheduled (current or past) for that class (Req 2.1, 2.3)
   * - Admin hits this endpoint but is blocked in service with clear error (Req 2.2)
   *
   * Writes audit log entry: user_id, role, before/after status, timestamp (Req 2.5, 2.6)
   *
   * Requirements: 2.1–2.6
   */
  @Patch(':absensiId')
  @Roles(Role.GURU, Role.KEPALA_SEKOLAH, Role.ADMIN)
  async updateAbsensi(
    @TenantId() tenantId: string,
    @Param('absensiId', ParseUUIDPipe) absensiId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAbsensiDto,
  ) {
    return this.absensiService.updateAbsensi(tenantId, user.id, user.role, absensiId, dto);
  }

  /**
   * GET /absensi/anak/:siswaId
   * Returns attendance calendar view for a specific child.
   * Orang_tua only — validates that the siswa belongs to the authenticated parent.
   *
   * Query params:
   * - bulan (1-12): defaults to current month
   * - tahun (2020-2030): defaults to current year
   *
   * Requirements: 8.1, 8.2, 8.3, 8.4
   */
  @Get('anak/:siswaId')
  @Roles(Role.ORANG_TUA)
  async getAbsensiAnak(
    @CurrentUser('id') userId: string,
    @Param('siswaId', ParseUUIDPipe) siswaId: string,
    @Query() query: GetAbsensiAnakQueryDto,
  ) {
    return this.absensiService.getAbsensiAnak(userId, siswaId, query.bulan, query.tahun);
  }

  /**
   * POST /absensi/sync
   * Accepts batch offline attendance records from mobile app.
   * Uses event-time LWW with authority override (ADR-003).
   *
   * Conflict resolution:
   * - Rule 1: Kepala_sekolah edits always win (authority override)
   * - Rule 2: Server edited after client event-time → server wins
   * - Rule 3: Client event-time newer → client wins
   *
   * Clock skew: rejects records with event_timestamp > server_now + 5 minutes.
   *
   * Requirements: 26.1–26.6
   */
  @Post('sync')
  @Roles(Role.GURU)
  async syncAbsensi(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Body() dto: SyncAbsensiDto,
  ) {
    return this.absensiService.syncAbsensi(tenantId, guruId, dto);
  }
}
