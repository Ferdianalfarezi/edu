import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { KenaikanKelasService } from './kenaikan-kelas.service';
import { PromoteStudentsDto } from './dto';

@Controller('kenaikan-kelas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class KenaikanKelasController {
  constructor(private readonly kenaikanKelasService: KenaikanKelasService) {}

  /**
   * GET /kenaikan-kelas/kelas/:kelasId
   * List active students in a class and suggest target class (tingkat+1).
   *
   * Requirements: 30.1, 30.7
   */
  @Get('kelas/:kelasId')
  async getStudentsForPromotion(
    @TenantId() tenantId: string,
    @Param('kelasId', ParseUUIDPipe) kelasId: string,
  ) {
    return this.kenaikanKelasService.getStudentsForPromotion(tenantId, kelasId);
  }

  /**
   * POST /kenaikan-kelas
   * Mass promote selected students to target class in new tahun_ajaran.
   * - Move siswa_ids to target_kelas_id
   * - For lulus_ids: set siswa.status = 'lulus' (alumni)
   * - Record in riwayat_kelas table
   * - Validate target kelas belongs to tahun_ajaran_baru
   *
   * Requirements: 30.2, 30.3, 30.5, 30.8, 30.9
   */
  @Post()
  async promoteStudents(@TenantId() tenantId: string, @Body() dto: PromoteStudentsDto) {
    return this.kenaikanKelasService.promoteStudents(tenantId, dto);
  }
}
