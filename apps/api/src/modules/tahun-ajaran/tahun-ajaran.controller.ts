import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { Role } from '@edu/shared';
import { TahunAjaranService } from './tahun-ajaran.service';
import { CreateTahunAjaranDto, UpdateSemesterDto } from './dto';

@Controller('tahun-ajaran')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TahunAjaranController {
  constructor(private readonly tahunAjaranService: TahunAjaranService) {}

  /**
   * POST /tahun-ajaran
   * Create a new tahun ajaran with status 'disiapkan'.
   * Admin only.
   */
  @Post()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@TenantId() tenantId: string, @Body() dto: CreateTahunAjaranDto) {
    return this.tahunAjaranService.create(tenantId, dto);
  }

  /**
   * GET /tahun-ajaran
   * List all tahun ajaran for the tenant.
   * Accessible by all staff roles (needed across multiple views).
   */
  @Get()
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA)
  @HttpCode(HttpStatus.OK)
  async findAll(@TenantId() tenantId: string) {
    return this.tahunAjaranService.findAll(tenantId);
  }

  /**
   * GET /tahun-ajaran/:id
   * Get tahun ajaran detail with class count.
   * Accessible by all staff roles.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH, Role.GURU, Role.BENDAHARA)
  @HttpCode(HttpStatus.OK)
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.tahunAjaranService.findOne(tenantId, id);
  }

  /**
   * PATCH /tahun-ajaran/:id/semester
   * Ubah batas semester (akhir Semester 1 & awal Semester 2).
   * Admin only.
   */
  @Patch(':id/semester')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateSemester(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.tahunAjaranService.updateSemester(tenantId, id, dto);
  }

  /**
   * PATCH /tahun-ajaran/:id/activate
   * Activate a tahun ajaran (deactivates the previous one).
   * Admin only.
   */
  @Patch(':id/activate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async activate(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.tahunAjaranService.activate(tenantId, id);
  }
}
