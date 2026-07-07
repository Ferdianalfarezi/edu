import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { NotifikasiService } from './notifikasi.service';
import { UpdatePreferensiDto, GetRiwayatQueryDto } from './dto';

@Controller('notifikasi')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotifikasiController {
  constructor(private readonly notifikasiService: NotifikasiService) {}

  /**
   * GET /notifikasi/riwayat
   * Returns cursor-paginated list of notification history for the authenticated parent.
   * Sorted by created_at DESC (newest first).
   * Each item includes delivery status (terkirim/gagal).
   *
   * Requirements: 7.1, 7.2, 7.3
   */
  @Get('riwayat')
  @Roles(Role.ORANG_TUA)
  async getRiwayat(@CurrentUser('id') userId: string, @Query() query: GetRiwayatQueryDto) {
    return this.notifikasiService.getRiwayat(userId, query);
  }

  /**
   * GET /notifikasi/preferensi
   * Returns per-child notification preference toggle states for the authenticated parent.
   * Defaults: kehadiran OFF, ketidakhadiran ON.
   *
   * Requirements: 25.1, 25.2, 25.4
   */
  @Get('preferensi')
  @Roles(Role.ORANG_TUA)
  async getPreferensi(@CurrentUser('id') userId: string) {
    return this.notifikasiService.getPreferensi(userId);
  }

  /**
   * PATCH /notifikasi/preferensi
   * Update notification preferences (kehadiran_enabled, ketidakhadiran_enabled) for a specific child.
   * Upsert: creates preference record if none exists, updates otherwise.
   *
   * Requirements: 25.3, 25.4
   */
  @Patch('preferensi')
  @Roles(Role.ORANG_TUA)
  async updatePreferensi(@CurrentUser('id') userId: string, @Body() dto: UpdatePreferensiDto) {
    return this.notifikasiService.updatePreferensi(userId, dto);
  }
}
