import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { RedisService } from '@/modules/redis/redis.service';
import { AuditLogService, AuditInterceptor } from '@/modules/audit-log';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { Role } from '@edu/shared';

describe('UserController', () => {
  let controller: UserController;
  let mockUserService: Partial<Record<keyof UserService, jest.Mock>>;

  beforeEach(async () => {
    mockUserService = {
      createUser: jest.fn(),
      listUsers: jest.fn(),
      getUserById: jest.fn(),
      updateUser: jest.fn(),
      deactivateUser: jest.fn(),
      superadminDeactivateUser: jest.fn(),
      superadminActivateUser: jest.fn(),
      bulkImportGuru: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
        { provide: AuditLogService, useValue: { create: jest.fn() } },
        { provide: DrizzleService, useValue: { getClient: jest.fn() } },
        AuditInterceptor,
        Reflector,
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  describe('POST /users', () => {
    it('should call createUser with tenantId and dto', async () => {
      const tenantId = 'tenant-1';
      const dto = { nama: 'Test', email: 'test@school.id', role: Role.GURU as const };
      const expected = { id: 'new-id', ...dto, isActive: true, mustChangePassword: true };

      mockUserService.createUser!.mockResolvedValue(expected);

      const result = await controller.createUser(tenantId, dto);

      expect(mockUserService.createUser).toHaveBeenCalledWith(tenantId, dto);
      expect(result.id).toBe('new-id');
    });
  });

  describe('GET /users', () => {
    it('should call listUsers with tenantId and query for ADMIN role', async () => {
      const tenantId = 'tenant-1';
      const query = { role: Role.GURU };
      const crossTenantQuery = { page: 1, page_size: 50 };
      const expected = { data: [], nextCursor: null };
      const mockReq = {
        user: { id: 'user-1', role: Role.ADMIN, tenant_id: tenantId },
        headers: {},
      } as unknown as import('express').Request;

      mockUserService.listUsers!.mockResolvedValue(expected);

      const result = await controller.listUsers(
        mockReq,
        tenantId,
        query as any,
        crossTenantQuery as any,
      );

      expect(mockUserService.listUsers).toHaveBeenCalledWith(tenantId, query);
      expect(result).toEqual(expected);
    });
  });

  describe('GET /users/:id', () => {
    it('should call getUserById with tenantId and id', async () => {
      const tenantId = 'tenant-1';
      const userId = 'user-1';
      const expected = { id: userId, nama: 'Test' };

      mockUserService.getUserById!.mockResolvedValue(expected);

      const result = await controller.getUser(tenantId, userId);

      expect(mockUserService.getUserById).toHaveBeenCalledWith(tenantId, userId);
      expect(result.id).toBe(userId);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should call updateUser with tenantId, id, and dto', async () => {
      const tenantId = 'tenant-1';
      const userId = 'user-1';
      const dto = { nama: 'Updated Name' };
      const expected = { id: userId, nama: 'Updated Name' };

      mockUserService.updateUser!.mockResolvedValue(expected);

      const result = await controller.updateUser(tenantId, userId, dto);

      expect(mockUserService.updateUser).toHaveBeenCalledWith(tenantId, userId, dto);
      expect(result.nama).toBe('Updated Name');
    });
  });

  describe('PATCH /users/:id/deactivate', () => {
    it('should call deactivateUser with tenantId and id for ADMIN role', async () => {
      const tenantId = 'tenant-1';
      const userId = 'user-1';
      const expected = { id: userId, nama: 'Test', isActive: false };
      const mockReq = { user: { id: 'admin-1', role: Role.ADMIN, tenant_id: tenantId } } as any;

      mockUserService.deactivateUser!.mockResolvedValue(expected);

      const result = await controller.deactivateUser(tenantId, userId, mockReq);

      expect(mockUserService.deactivateUser).toHaveBeenCalledWith(tenantId, userId);
      expect(result.isActive).toBe(false);
    });

    it('should call superadminDeactivateUser for SUPER_ADMIN role', async () => {
      const userId = 'user-1';
      const expected = { id: userId, nama: 'Test', isActive: false };
      const mockReq = { user: { id: 'sa-1', role: Role.SUPER_ADMIN, tenant_id: null } } as any;

      mockUserService.superadminDeactivateUser = jest.fn().mockResolvedValue(expected);

      const result = await controller.deactivateUser(null, userId, mockReq);

      expect(mockUserService.superadminDeactivateUser).toHaveBeenCalledWith(userId);
      expect(result.isActive).toBe(false);
    });
  });

  describe('POST /users/bulk-import', () => {
    it('should call bulkImportGuru with CSV content from file', async () => {
      const tenantId = 'tenant-1';
      const csvContent = 'nama,email\nBudi,budi@school.id';
      const file = {
        buffer: Buffer.from(csvContent, 'utf-8'),
        originalname: 'guru.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      const expected = { created: 1, skipped: [], total: 1 };
      mockUserService.bulkImportGuru!.mockResolvedValue(expected);

      const result = await controller.bulkImport(tenantId, file);

      expect(mockUserService.bulkImportGuru).toHaveBeenCalledWith(tenantId, csvContent);
      expect(result.created).toBe(1);
    });

    it('should throw BadRequestException if no file uploaded', async () => {
      const tenantId = 'tenant-1';

      await expect(controller.bulkImport(tenantId, undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
