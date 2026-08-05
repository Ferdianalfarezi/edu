import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Role } from '@edu/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TenantId } from '@/common/decorators/tenant-id.decorator';
import { Auditable, AuditInterceptor } from '@/modules/audit-log';
import { RequestUser } from '@/modules/auth/interfaces';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, UpdateUserRoleDto, ListUsersQueryDto } from './dto';

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
   * For ADMIN / KEPALA_SEKOLAH: List all users within the tenant. Cursor-paginated.
   *   When ?role=guru is provided, returns a flat guru list { data: [{id, nama, email, telepon}] }
   *   suitable for the Guru management view (Req 3.4).
   * For SUPER_ADMIN: Cross-tenant user list with tenant name, offset-paginated (default page_size 50).
   * Supports search by email/nama/phone (min 3 chars for cross-tenant).
   * When X-Tenant-Context is set, scopes to that tenant.
   */
  @Get()
  @Roles(Role.ADMIN, Role.KEPALA_SEKOLAH, Role.SUPER_ADMIN)
  async listUsers(
    @Req() req: Request,
    @TenantId() tenantId: string,
    @Query() query: ListUsersQueryDto,
  ) {
    const requestUser = (req as Request & { user: RequestUser }).user;

    if (requestUser.role === Role.SUPER_ADMIN) {
      // Detect tenant context via X-Tenant-Context header
      const tenantContext = req.headers['x-tenant-context'] as string | undefined;
      return this.userService.listUsersCrossTenant(
        query.page || 1,
        query.page_size || 50,
        query.search,
        tenantContext || undefined,
      );
    }

    // ADMIN / KEPALA_SEKOLAH: when filtering by guru role, return the flat guru list
    // (Req 3.4 — returns {id, nama, email, telepon}, only isActive=true)
    if (query.role === Role.GURU) {
      return this.userService.listGuru(tenantId);
    }

    // Default: existing tenant-scoped, cursor-paginated behavior
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
   * PATCH /users/:id/role
   * Update user role (SUPER_ADMIN only).
   * Validates role is in allowed set; rejects SUPER_ADMIN assignment.
   */
  @Patch(':id/role')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'role_assignment',
    action: 'role_change',
    entityIdSource: 'params.id',
    strictMode: true,
  })
  async updateUserRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserRoleDto) {
    return this.userService.updateUserRole(id, dto.role);
  }

  /**
   * PATCH /users/:id/deactivate
   * Deactivate user and invalidate all their tokens.
   * ADMIN: tenant-scoped deactivation.
   * SUPER_ADMIN: cross-tenant deactivation with session invalidation.
   */
  @Patch(':id/deactivate')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'user',
    action: 'deactivate',
    entityIdSource: 'params.id',
    strictMode: true,
  })
  async deactivateUser(
    @TenantId() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const currentUser = req.user as RequestUser;
    if (currentUser.role === Role.SUPER_ADMIN) {
      return this.userService.superadminDeactivateUser(id);
    }
    return this.userService.deactivateUser(tenantId!, id);
  }

  /**
   * PATCH /users/:id/activate
   * Activate a previously deactivated user (SUPER_ADMIN only).
   */
  @Patch(':id/activate')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'user',
    action: 'activate',
    entityIdSource: 'params.id',
    strictMode: true,
  })
  async activateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.superadminActivateUser(id);
  }

  /**
   * POST /users/:id/reset-password
   * Reset user password (SUPER_ADMIN only). Generates temp password,
   * marks must_change_password, and sends email with credentials.
   */
  @Post(':id/reset-password')
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AuditInterceptor)
  @Auditable({
    entityType: 'user',
    action: 'password_reset',
    entityIdSource: 'params.id',
    strictMode: true,
    excludeFields: ['password', 'password_hash', 'temp_password'],
  })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const currentUser = (req as Request & { user: RequestUser }).user;
    return this.userService.resetPassword(currentUser.id, currentUser.role, id);
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
   * CSV file upload for bulk user creation (admin, kepala_sekolah, guru, bendahara).
   * CSV format: nama, email, role (one row per user).
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
    return this.userService.bulkImportUsers(tenantId, csvContent);
  }
}
