import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, ListUsersQueryDto } from './dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * POST /users
   * Create a single user (admin, guru, kepala_sekolah, bendahara) within the tenant.
   * Generates random password, sends credentials via email, flags must_change_password.
   */
  @Post()
  async createUser(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.userService.createUser(tenantId, dto);
  }

  /**
   * GET /users
   * List all users within the tenant. Cursor-paginated.
   * Supports filtering by role and search by name/email.
   */
  @Get()
  async listUsers(@TenantId() tenantId: string, @Query() query: ListUsersQueryDto) {
    return this.userService.listUsers(tenantId, query);
  }

  /**
   * GET /users/:id
   * Get single user detail within the tenant.
   */
  @Get(':id')
  async getUser(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.userService.getUserById(tenantId, id);
  }

  /**
   * PATCH /users/:id
   * Update user (name, email, role) within the tenant.
   */
  @Patch(':id')
  async updateUser(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(tenantId, id, dto);
  }

  /**
   * PATCH /users/:id/deactivate
   * Deactivate user and invalidate all their tokens.
   */
  @Patch(':id/deactivate')
  async deactivateUser(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.userService.deactivateUser(tenantId, id);
  }

  /**
   * PATCH /users/:id/deactivate-guru
   * Deactivate a guru user, invalidate tokens, mark jadwal as vacant,
   * remove wali_kelas assignments, and return list of vacant slots needing replacement.
   * Requirements: 32.1–32.9
   */
  @Patch(':id/deactivate-guru')
  async deactivateGuru(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.userService.deactivateGuru(tenantId, id);
  }

  /**
   * POST /users/bulk-import
   * CSV file upload for bulk guru creation.
   * CSV format: nama, email (one row per guru).
   * Generates random passwords and sends credentials via email.
   */
  @Post('bulk-import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 1 * 1024 * 1024 }, // 1MB max for CSV
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.endsWith('.csv')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Hanya file CSV yang diperbolehkan'), false);
        }
      },
    }),
  )
  async bulkImport(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File CSV wajib diupload');
    }

    const csvContent = file.buffer.toString('utf-8');
    return this.userService.bulkImportGuru(tenantId, csvContent);
  }
}
