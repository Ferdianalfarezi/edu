import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { MataPelajaranService } from './mata-pelajaran.service';
import { CreateMataPelajaranDto, UpdateMataPelajaranDto } from './dto';

@Controller('mata-pelajaran')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MataPelajaranController {
  constructor(private readonly mataPelajaranService: MataPelajaranService) {}

  /**
   * POST /mata-pelajaran
   * Create a new subject for the current tenant.
   * Requirements: 31.1, 31.2
   */
  @Post()
  @Roles(Role.ADMIN)
  async create(@TenantId() tenantId: string, @Body() dto: CreateMataPelajaranDto) {
    return this.mataPelajaranService.create(tenantId, dto);
  }

  /**
   * GET /mata-pelajaran
   * List all subjects for the current tenant.
   * Accessible by all staff roles (needed for jadwal, rapor, rpp views).
   * Requirements: 31.2
   */
  @Get()
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH, Role.BENDAHARA)
  async findAll(@TenantId() tenantId: string) {
    return this.mataPelajaranService.findAll(tenantId);
  }

  /**
   * GET /mata-pelajaran/:id
   * Get a single subject by ID.
   * Accessible by all staff roles.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH, Role.BENDAHARA)
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mataPelajaranService.findOne(tenantId, id);
  }

  /**
   * PATCH /mata-pelajaran/:id
   * Update a subject (nama, kode).
   */
  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMataPelajaranDto,
  ) {
    return this.mataPelajaranService.update(tenantId, id, dto);
  }

  /**
   * DELETE /mata-pelajaran/:id
   * Delete a subject only if no active jadwal references it.
   * Requirements: 31.3, 31.4
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mataPelajaranService.remove(tenantId, id);
  }
}
