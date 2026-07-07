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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JadwalService } from './jadwal.service';
import {
  CreateJadwalDto,
  UpdateJadwalDto,
  FilterJadwalDto,
  FilterJadwalSayaDto,
  CreateGuruPenggantiDto,
  FilterGuruPenggantiDto,
} from './dto';

@Controller('jadwal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JadwalController {
  constructor(private readonly jadwalService: JadwalService) {}

  /**
   * POST /jadwal
   * Create a new jadwal pelajaran entry.
   * Only admin can manage jadwal.
   *
   * Requirements: 27.1, 27.2
   */
  @Post()
  @Roles(Role.ADMIN)
  async create(
    @TenantId() tenantId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateJadwalDto,
  ) {
    return this.jadwalService.create(tenantId, adminId, dto);
  }

  /**
   * GET /jadwal
   * List jadwal pelajaran with optional filters.
   * Accessible by admin, guru, kepala_sekolah.
   *
   * Requirements: 27.4, 27.10
   */
  @Get()
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async findAll(@TenantId() tenantId: string, @Query() filters: FilterJadwalDto) {
    return this.jadwalService.findAll(tenantId, filters);
  }

  // ─── Guru Pengganti Endpoints ───────────────────────────────────────────
  // These must be defined BEFORE the :id param routes to avoid route conflicts.

  /**
   * POST /jadwal/guru-pengganti
   * Assign a substitute teacher for a specific class+subject on a given date.
   * Only admin can assign substitutes.
   *
   * Requirements: 28.1
   */
  @Post('guru-pengganti')
  @Roles(Role.ADMIN)
  async createGuruPengganti(
    @TenantId() tenantId: string,
    @CurrentUser('id') assignedBy: string,
    @Body() dto: CreateGuruPenggantiDto,
  ) {
    return this.jadwalService.createGuruPengganti(tenantId, assignedBy, dto);
  }

  /**
   * GET /jadwal/guru-pengganti
   * List active guru pengganti assignments, filterable by kelasId and tanggal.
   * Accessible by admin, guru, kepala_sekolah.
   *
   * Requirements: 28.2
   */
  @Get('guru-pengganti')
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async findAllGuruPengganti(
    @TenantId() tenantId: string,
    @Query() filters: FilterGuruPenggantiDto,
  ) {
    return this.jadwalService.findAllGuruPengganti(tenantId, filters);
  }

  /**
   * DELETE /jadwal/guru-pengganti/:id
   * Remove a guru pengganti assignment.
   * Only admin can remove assignments.
   */
  @Delete('guru-pengganti/:id')
  @Roles(Role.ADMIN)
  async removeGuruPengganti(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jadwalService.removeGuruPengganti(tenantId, id);
  }

  // ─── Jadwal Saya (Guru's Teaching Schedule) ────────────────────────────

  /**
   * GET /jadwal/saya
   * Return the authenticated guru's teaching schedule for today (or specified day).
   * Shows slot info: kelas, mapel, jam_mulai, jam_selesai.
   * Indicates slots with active guru_pengganti assigned.
   *
   * Requirements: 33.1, 33.2, 33.3, 33.4
   */
  @Get('saya')
  @Roles(Role.GURU)
  async getJadwalSaya(
    @TenantId() tenantId: string,
    @CurrentUser('id') guruId: string,
    @Query() filters: FilterJadwalSayaDto,
  ) {
    return this.jadwalService.getJadwalSaya(tenantId, guruId, filters);
  }

  // ─── Jadwal :id Param Routes ────────────────────────────────────────────

  /**
   * GET /jadwal/:id
   * Get a single jadwal pelajaran entry.
   * Accessible by admin, guru, kepala_sekolah.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jadwalService.findOne(tenantId, id);
  }

  /**
   * PATCH /jadwal/:id
   * Update a jadwal pelajaran entry (guru, times, validity).
   * Only admin can manage jadwal.
   *
   * Requirements: 27.7, 27.8
   */
  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateJadwalDto,
  ) {
    return this.jadwalService.update(tenantId, id, adminId, dto);
  }

  /**
   * DELETE /jadwal/:id
   * Delete a jadwal pelajaran entry.
   * Only admin can manage jadwal.
   *
   * Requirements: 27.7
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jadwalService.remove(tenantId, id);
  }
}
