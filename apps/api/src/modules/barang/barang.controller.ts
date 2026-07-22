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
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { BarangService } from './barang.service';
import { CreateBarangDto, UpdateBarangDto, ListBarangQueryDto, BarangResponseDto } from './dto';

@Controller('barang')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BarangController {
  constructor(private readonly barangService: BarangService) {}

  /**
   * GET /barang
   * List barang with pagination and search.
   * Accessible by admin, guru, kepala_sekolah.
   */
  @Get()
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListBarangQueryDto,
  ): Promise<PaginatedResponse<BarangResponseDto>> {
    return this.barangService.findAll(tenantId, query);
  }

  /**
   * GET /barang/:id
   * Get single barang by ID.
   * Accessible by admin, guru, kepala_sekolah.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.GURU, Role.KEPALA_SEKOLAH)
  async getById(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BarangResponseDto> {
    return this.barangService.findOne(tenantId, id);
  }

  /**
   * POST /barang
   * Create a new barang.
   * Admin only.
   */
  @Post()
  @Roles(Role.ADMIN)
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateBarangDto,
  ): Promise<BarangResponseDto> {
    return this.barangService.create(tenantId, dto);
  }

  /**
   * PATCH /barang/:id
   * Update an existing barang.
   * Admin only.
   */
  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBarangDto,
  ): Promise<BarangResponseDto> {
    return this.barangService.update(tenantId, id, dto);
  }

  /**
   * DELETE /barang/:id
   * Soft delete a barang (sets deleted_at).
   * Admin only.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  async remove(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.barangService.remove(tenantId, id);
    return { message: 'Barang berhasil dihapus' };
  }
}
