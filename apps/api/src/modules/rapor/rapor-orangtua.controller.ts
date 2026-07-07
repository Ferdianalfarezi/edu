import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RaporOrangTuaService } from './rapor-orangtua.service';

/**
 * Rapor Controller for Orang Tua (Mobile API).
 * Provides read-only access to finalized rapor for their children.
 *
 * Requirements: 39.1–39.5
 */
@Controller('rapor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RaporOrangTuaController {
  constructor(private readonly raporOrangTuaService: RaporOrangTuaService) {}

  /**
   * GET /rapor/siswa/:siswaId
   * Returns all finalized rapor periods for a specific child.
   * Orang_tua only — validates parent owns this child (siswa.orang_tua_id == userId).
   *
   * Only shows rapor where status == 'final' (Req 39.1, 39.2).
   * Returns: array of periods with nilai per mapel, capaian, P5, catatan wali, peringkat, rata-rata.
   *
   * Requirements: 39.1, 39.2, 39.3, 39.4, 39.5
   */
  @Get('siswa/:siswaId')
  @Roles(Role.ORANG_TUA)
  async getRaporSiswa(
    @CurrentUser('id') userId: string,
    @Param('siswaId', ParseUUIDPipe) siswaId: string,
  ) {
    const data = await this.raporOrangTuaService.getRaporSiswa(userId, siswaId);
    return { data };
  }
}
