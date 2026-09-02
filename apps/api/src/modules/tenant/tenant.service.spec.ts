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
      jumlah_tingkat: 6,
      admin_nama: 'Admin Sekolah',
      admin_email: 'admin@sdharapan.sch.id',
    };

    it('should create a tenant with a default admin user and enqueue credentials email', async () => {
      // validateOnboardingData: no existing user with admin_email
      const selectChainNoUser = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChainNoUser);

      // Inside transaction: mock insert calls for tenant, tahun_ajaran, and admin user
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
      const newTahunAjaran = { id: 'ta-uuid', nama: '2024/2025' };
      const newAdmin = {
        id: 'admin-uuid-new',
        email: 'admin@sdharapan.sch.id',
        nama: 'Admin Sekolah',
      };

      const tenantInsertChain = createInsertChain([newTenant]);
      const tahunAjaranInsertChain = createInsertChain([newTahunAjaran]);
      const userInsertChain = createInsertChain([newAdmin]);

      // tx inherits same mock methods
      const mockTx = {
        insert: jest
          .fn()
          .mockReturnValueOnce(tenantInsertChain)
          .mockReturnValueOnce(tahunAjaranInsertChain)
          .mockReturnValueOnce(userInsertChain),
      };
      mockDb.transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx));

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');

      const result = await service.createTenant(createDto);

      expect(result.tenant.id).toBe('tenant-uuid-new');
      expect(result.tenant.nama).toBe('SD Harapan Baru');
      expect(result.admin.id).toBe('admin-uuid-new');
      expect(result.admin.email).toBe('admin@sdharapan.sch.id');
      // No onboarding arrays → no onboarding_summary
      expect(result.onboarding_summary).toBeUndefined();

      // Verify bcrypt was called to hash the generated password
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10);

      // Verify email job was enqueued after tx commit
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
      const selectChainNoUser = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChainNoUser);

      const newTenant = { id: 'tid', nama: 'T', email: 'e@e.com' };
      const newTahunAjaran = { id: 'ta-uuid', nama: '2024/2025' };
      const newAdmin = { id: 'aid', email: 'a@a.com', nama: 'A' };

      const mockTx = {
        insert: jest
          .fn()
          .mockReturnValueOnce(createInsertChain([newTenant]))
          .mockReturnValueOnce(createInsertChain([newTahunAjaran]))
          .mockReturnValueOnce(createInsertChain([newAdmin])),
      };
      mockDb.transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx));

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');

      await service.createTenant(createDto);

      // The password passed to bcrypt.hash should be at least 12 chars
      const passwordArg = (mockedBcrypt.hash as jest.Mock).mock.calls[0][0];
      expect(passwordArg.length).toBeGreaterThanOrEqual(12);
    });

    it('should set mustChangePassword to true for the default admin', async () => {
      const selectChainNoUser = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChainNoUser);

      const newTenant = { id: 'tid', nama: 'T', email: 'e@e.com' };
      const newTahunAjaran = { id: 'ta-uuid', nama: '2024/2025' };
      const newAdmin = { id: 'aid', email: 'a@a.com', nama: 'A' };

      const tenantInsertChain = createInsertChain([newTenant]);
      const tahunAjaranInsertChain = createInsertChain([newTahunAjaran]);
      const userInsertChain = createInsertChain([newAdmin]);

      const mockTx = {
        insert: jest
          .fn()
          .mockReturnValueOnce(tenantInsertChain)
          .mockReturnValueOnce(tahunAjaranInsertChain)
          .mockReturnValueOnce(userInsertChain),
      };
      mockDb.transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx));

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

    it('should create parent user and link to siswa when teleponWali is provided', async () => {
      const createDtoWithSiswa = {
        nama: 'SD Harapan',
        alamat: 'Jl. A',
        telepon: '021-111',
        email: 'info@sd.id',
        jumlah_tingkat: 6,
        admin_nama: 'Admin',
        admin_email: 'admin@sd.id',
        siswa: [
          {
            nama: 'Budi',
            nisn: '1234567890',
            namaWali: 'Ibu Sari',
            teleponWali: '081234567890',
          },
        ],
      };

      // validateOnboardingData: no existing admin email
      const selectChainNoUser = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChainNoUser);

      const newTenant = { id: 'tenant-id', nama: 'SD Harapan', email: 'info@sd.id' };
      const newTahunAjaran = { id: 'ta-id', nama: '2024/2025' };
      const newAdmin = { id: 'admin-id', email: 'admin@sd.id', nama: 'Admin' };
      const newParent = { id: 'parent-id' };
      const newSiswa = [{ id: 'siswa-id' }];

      // Track insert calls to verify orangTuaId
      let siswaInsertValues: any = null;
      let insertCallCount = 0;

      const mockTx = {
        select: jest.fn().mockReturnValue(createSelectChain([])), // No existing parent
        insert: jest.fn().mockImplementation(() => {
          const returnValues = [
            [newTenant], // tenant
            [newTahunAjaran], // tahunAjaran
            [newAdmin], // admin
            [newParent], // parent (from resolveOrCreateParentInTx)
            newSiswa, // siswa
          ];
          const chain = {
            values: jest.fn().mockImplementation((vals) => {
              if (vals && Array.isArray(vals) && vals[0] && 'orangTuaId' in vals[0]) {
                siswaInsertValues = vals;
              }
              return chain;
            }),
            returning: jest.fn().mockResolvedValue(returnValues[insertCallCount++] || []),
          };
          return chain;
        }),
      };

      mockDb.transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx));

      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('$2b$10$hashed');

      const result = await service.createTenant(createDtoWithSiswa);

      expect(result.onboarding_summary?.siswa).toBe(1);
      // Verify that siswa was inserted with orangTuaId
      expect(siswaInsertValues).not.toBeNull();
      expect(siswaInsertValues[0].orangTuaId).toBe('parent-id');
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

  describe('resolveOrCreateParentInTx', () => {
    it('should create new parent user when phone does not exist', async () => {
      // Setup: no existing user with this phone
      const selectChain = createSelectChain([]);
      const mockTx = {
        select: jest.fn().mockReturnValue(selectChain),
        insert: jest.fn().mockReturnValue(createInsertChain([{ id: 'new-parent-id' }])),
      };

      const result = await (service as any).resolveOrCreateParentInTx(
        mockTx,
        '081234567890',
        'Ibu Sari',
      );

      expect(result).toBe('new-parent-id');
      expect(mockTx.insert).toHaveBeenCalled();
      // Verify insert was called with correct values
      const insertCall = mockTx.insert.mock.results[0].value;
      expect(insertCall.values).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '081234567890',
          nama: 'Ibu Sari',
          role: 'orang_tua',
          tenantId: null,
          passwordHash: null,
          isActive: true,
        }),
      );
    });

    it('should return existing parent ID when phone already exists', async () => {
      // Setup: existing user with this phone
      const selectChain = createSelectChain([{ id: 'existing-parent-id' }]);
      const mockTx = {
        select: jest.fn().mockReturnValue(selectChain),
        insert: jest.fn(),
      };

      const result = await (service as any).resolveOrCreateParentInTx(
        mockTx,
        '081234567890',
        'Ibu Sari',
      );

      expect(result).toBe('existing-parent-id');
      expect(mockTx.insert).not.toHaveBeenCalled();
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
          jumlahTingkat: 6,
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
          jumlahTingkat: 3,
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
      expect(result[0].user_count).toBe(5);
      expect(result[0].is_active).toBe(true);
      expect(result[1].nama).toBe('SMP Bersama');
      expect(result[1].user_count).toBe(0);
      expect(result[1].is_active).toBe(false);
    });

    it('should return empty array when no tenants exist', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.listTenants();

      expect(result).toEqual([]);
    });
  });
});
