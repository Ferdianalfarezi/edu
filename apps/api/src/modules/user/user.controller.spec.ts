import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { RedisService } from '@/modules/redis/redis.service';
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
      bulkImportGuru: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: RedisService, useValue: {} },
        { provide: DRIZZLE, useValue: {} },
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
    it('should call listUsers with tenantId and query', async () => {
      const tenantId = 'tenant-1';
      const query = { role: Role.GURU };
      const expected = { data: [], nextCursor: null };

      mockUserService.listUsers!.mockResolvedValue(expected);

      const result = await controller.listUsers(tenantId, query);

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
    it('should call deactivateUser with tenantId and id', async () => {
      const tenantId = 'tenant-1';
      const userId = 'user-1';
      const expected = { id: userId, nama: 'Test', isActive: false };

      mockUserService.deactivateUser!.mockResolvedValue(expected);

      const result = await controller.deactivateUser(tenantId, userId);

      expect(mockUserService.deactivateUser).toHaveBeenCalledWith(tenantId, userId);
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
