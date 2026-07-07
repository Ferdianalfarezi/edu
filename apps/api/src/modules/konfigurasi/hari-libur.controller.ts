import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { KonfigurasiService } from './konfigurasi.service';
import { CreateHariLiburDto } from './dto';

@Controller('konfigurasi/hari-libur')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.KEPALA_SEKOLAH)
export class HariLiburController {
  constructor(private readonly konfigurasiService: KonfigurasiService) {}

  /**
   * GET /hari-libur
   * List all holidays for tenant (current year or specified year).
   */
  @Get()
  async getHariLibur(@TenantId() tenantId: string, @Query('year') year?: string) {
    const parsedYear = year ? parseInt(year, 10) : undefined;
    return this.konfigurasiService.getHariLibur(tenantId, parsedYear);
  }

  /**
   * POST /hari-libur
   * Create a holiday entry.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createHariLibur(@TenantId() tenantId: string, @Body() dto: CreateHariLiburDto) {
    return this.konfigurasiService.createHariLibur(tenantId, dto);
  }

  /**
   * DELETE /hari-libur/:id
   * Remove a holiday entry.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHariLibur(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.konfigurasiService.deleteHariLibur(tenantId, id);
  }
}
