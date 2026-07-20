import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/interfaces';
import { PengumumanService } from './pengumuman.service';
import { CreatePengumumanDto, ListPengumumanQueryDto } from './pengumuman.dto';

@Controller('pengumuman')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PengumumanController {
  constructor(private readonly pengumumanService: PengumumanService) {}

  /**
   * POST /pengumuman
   * Create and send a new announcement.
   * Resolves recipients, enqueues FCM delivery job.
   *
   * Requirements: 7.1, 6.6
   */
  @Post()
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
  async createPengumuman(@Body() dto: CreatePengumumanDto, @CurrentUser() user: RequestUser) {
    return this.pengumumanService.create(dto, user);
  }

  /**
   * GET /pengumuman
   * List announcements for admin's tenant (paginated, desc by created_at).
   *
   * Requirements: 7.1, 7.3
   */
  @Get()
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
  async listPengumuman(@Query() query: ListPengumumanQueryDto, @CurrentUser() user: RequestUser) {
    return this.pengumumanService.list(query, user.tenant_id!);
  }

  /**
   * GET /pengumuman/:id
   * Get announcement detail. Restricted to recipients only.
   *
   * Requirements: 7.3, 6.6
   */
  @Get(':id')
  @Roles(Role.ORANG_TUA)
  async getDetailPengumuman(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pengumumanService.getDetail(id, user);
  }
}
