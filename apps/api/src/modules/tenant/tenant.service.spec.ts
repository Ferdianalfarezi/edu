import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import * as bcrypt from 'bcrypt';
import { TenantService } from './tenant.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { AuthService } from '@/modules/auth/auth.service';
import { QUEUE_NAMES } from '@/modules/queue';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('TenantService', () => {
  let service: TenantService;
  let mockDb: any;
  let mockAuthService: any;
  let mockEmailQueue: any;

  // Helper to create a chainable query builder mock
  function createSelectChain(results: any[] = []) {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.leftJoin = jest.fn().mockReturnValue(chain);
    chain.groupBy = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockResolvedValue(results);
    chain.limit = jest.fn().mockResolvedValue(results);
    return chain;
  }

  function createInsertChain(results: any[] = []) {
    const chain: any = {};
    chain.values = jest.fn().mockReturnValue(chain);
    chain.returning = jest.fn().mockResolvedValue(results);
    return chain;
  }

  function createUpdateChain() {
    const chain: any = {};
    chain.set = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockResolvedValue(undefined);
    return chain;
  }

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockAuthService = {
      invalidateAllTenantTokens: jest.fn().mockResolvedValue(undefined),
    };

    mockEmailQueue = {
      add: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: AuthService, useValue: mockAuthService },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<TenantService>(TenantService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTenant', () => {
    const createDto = {
      nama: 'SD Harapan Baru',
      alamat: 'Jl. Merdeka No. 1',
      telepon: '021-123456',
      email: 'info@sdharapan.sch.id',
      admin_nama: 'Admin Sekolah',
      admin_email: 'admin@sdharapan.sch.id',
    };

    it('should create a tenant with a default admin user and enqueue credentials email', async () => {
      // Mock: no existing user with that email
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      // Mock: insert tenant
      const newTenant = {
        id: 'tenant-uuid-new',
        nama: 'SD Harapan Baru',
        email: 'info@sdharapan.sch.id',
        alamat: 'Jl. Merdeka No. 1',
        telepon: '021-123456',
        logoUrl: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const tenantInsertChain = createInsertChain([newTenant]);

      // Mock: insert user (admin)
      const newAdmin = {
        id: 'admin-uuid-new',
        email: 'admin@sdharapan.sch.id',
        nama: 'Admin Sekolah',
      };
      const userInsertChain = createInsertChain([newAdmin]);

      mockDb.insert.mockReturnValueOnce(tenantInsertChain).mockReturnValueOnce(userInsertChain);

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');

      const result = await service.createTenant(createDto);

      expect(result.tenant.id).toBe('tenant-uuid-new');
      expect(result.tenant.nama).toBe('SD Harapan Baru');
      expect(result.admin.id).toBe('admin-uuid-new');
      expect(result.admin.email).toBe('admin@sdharapan.sch.id');

      // Verify bcrypt was called to hash the generated password
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10);

      // Verify email job was enqueued
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'send-tenant-credentials',
        expect.objectContaining({
          to: 'admin@sdharapan.sch.id',
          tenantName: 'SD Harapan Baru',
          adminName: 'Admin Sekolah',
          email: 'admin@sdharapan.sch.id',
          password: expect.any(String),
        }),
      );
    });

    it('should throw BadRequestException if admin email is already in use', async () => {
      const selectChain = createSelectChain([{ id: 'existing-user-id' }]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.createTenant(createDto)).rejects.toThrow(BadRequestException);
      await expect(service.createTenant(createDto)).rejects.toThrow(
        'Email admin@sdharapan.sch.id sudah digunakan oleh user lain',
      );
    });

    it('should generate a password of at least 12 characters', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const newTenant = { id: 'tid', nama: 'T', email: 'e@e.com' };
      const newAdmin = { id: 'aid', email: 'a@a.com', nama: 'A' };
      mockDb.insert
        .mockReturnValueOnce(createInsertChain([newTenant]))
        .mockReturnValueOnce(createInsertChain([newAdmin]));

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');

      await service.createTenant(createDto);

      // The password passed to bcrypt.hash should be at least 12 chars
      const passwordArg = (mockedBcrypt.hash as jest.Mock).mock.calls[0][0];
      expect(passwordArg.length).toBeGreaterThanOrEqual(12);
    });

    it('should set mustChangePassword to true for the default admin', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const newTenant = { id: 'tid', nama: 'T', email: 'e@e.com' };
      const newAdmin = { id: 'aid', email: 'a@a.com', nama: 'A' };

      const tenantInsertChain = createInsertChain([newTenant]);
      const userInsertChain = createInsertChain([newAdmin]);

      mockDb.insert.mockReturnValueOnce(tenantInsertChain).mockReturnValueOnce(userInsertChain);

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');

      await service.createTenant(createDto);

      // Check that the user insert values include mustChangePassword: true
      expect(userInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          mustChangePassword: true,
          role: 'admin',
          tenantId: 'tid',
        }),
      );
    });
  });

  describe('deactivateTenant', () => {
    it('should deactivate tenant and invalidate all tokens', async () => {
      const existingTenant = {
        id: 'tenant-uuid-1',
        nama: 'SD Maju',
        isActive: true,
      };
      const selectChain = createSelectChain([existingTenant]);
      mockDb.select.mockReturnValue(selectChain);

      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const result = await service.deactivateTenant('tenant-uuid-1');

      expect(result.message).toContain('SD Maju');
      expect(result.message).toContain('berhasil dinonaktifkan');
      expect(mockAuthService.invalidateAllTenantTokens).toHaveBeenCalledWith('tenant-uuid-1');
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.deactivateTenant('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if tenant is already inactive', async () => {
      const inactiveTenant = {
        id: 'tenant-uuid-1',
        nama: 'SD Maju',
        isActive: false,
      };
      const selectChain = createSelectChain([inactiveTenant]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.deactivateTenant('tenant-uuid-1')).rejects.toThrow(BadRequestException);
      await expect(service.deactivateTenant('tenant-uuid-1')).rejects.toThrow(
        'Tenant sudah nonaktif',
      );
    });
  });

  describe('listTenants', () => {
    it('should return all tenants with user count stats', async () => {
      const mockResults = [
        {
          id: 'tenant-1',
          nama: 'SD Maju',
          alamat: 'Jl. A',
          telepon: '021-111',
          email: 'a@a.com',
          logoUrl: null,
          isActive: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          userCount: '5',
        },
        {
          id: 'tenant-2',
          nama: 'SMP Bersama',
          alamat: null,
          telepon: null,
          email: 'b@b.com',
          logoUrl: null,
          isActive: false,
          createdAt: new Date('2024-02-01'),
          updatedAt: new Date('2024-02-01'),
          userCount: '0',
        },
      ];

      const selectChain = createSelectChain(mockResults);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.listTenants();

      expect(result).toHaveLength(2);
      expect(result[0].nama).toBe('SD Maju');
      expect(result[0].userCount).toBe(5);
      expect(result[0].isActive).toBe(true);
      expect(result[1].nama).toBe('SMP Bersama');
      expect(result[1].userCount).toBe(0);
      expect(result[1].isActive).toBe(false);
    });

    it('should return empty array when no tenants exist', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.listTenants();

      expect(result).toEqual([]);
    });
  });
});
