import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JadwalService } from './jadwal.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { TenantService } from '@/modules/tenant/tenant.service';
import { CreateGuruPenggantiDto } from './dto';

describe('JadwalService - Guru Pengganti', () => {
  let service: JadwalService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const guruPenggantiId = '55555555-5555-5555-5555-555555555555';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';
  const assignmentId = '99999999-9999-9999-9999-999999999999';

  // Helper: get a future date string (tomorrow)
  const getFutureDate = (): string => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  // Helper: get today's date string
  const getToday = (): string => {
    return new Date().toISOString().split('T')[0];
  };

  // Helper: get a past date string (yesterday)
  const getPastDate = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const mockAssignment = {
    id: assignmentId,
    tenantId,
    guruPenggantiId,
    kelasId,
    mataPelajaranId: mapelId,
    tanggal: getFutureDate(),
    ditugaskanOleh: adminId,
    createdAt: new Date(),
  };

  // Chain-able query builder mock
  const createChainMock = (returnValue: unknown = []) => {
    const chain: Record<string, jest.Mock> = {};
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.leftJoin = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.values = jest.fn().mockReturnValue(chain);
    chain.set = jest.fn().mockReturnValue(chain);
    chain.returning = jest
      .fn()
      .mockResolvedValue(Array.isArray(returnValue) ? returnValue : [returnValue]);
    chain.then = jest
      .fn()
      .mockImplementation((resolve) =>
        resolve(Array.isArray(returnValue) ? returnValue : [returnValue]),
      );
    return chain;
  };

  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JadwalService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
        {
          provide: TenantService,
          useValue: {
            getHariKerja: jest.fn().mockResolvedValue('6_hari'),
          },
        },
      ],
    }).compile();

    service = module.get<JadwalService>(JadwalService);
  });

  describe('createGuruPengganti', () => {
    const validDto: CreateGuruPenggantiDto = {
      guruPenggantiId,
      kelasId,
      mataPelajaranId: mapelId,
      tanggal: getFutureDate(),
    };

    it('should create a guru pengganti assignment when all validations pass', async () => {
      // Mock validation: guru exists, active, role=guru
      const guruChain = createChainMock([{ id: guruPenggantiId, role: 'guru', isActive: true }]);
      // Mock validation: kelas exists
      const kelasChain = createChainMock([{ id: kelasId }]);
      // Mock validation: mapel exists
      const mapelChain = createChainMock([{ id: mapelId }]);

      mockDb.select
        .mockReturnValueOnce(guruChain) // validateActiveGuru
        .mockReturnValueOnce(kelasChain) // validateKelas
        .mockReturnValueOnce(mapelChain); // validateMataPelajaran

      // Mock insert
      const insertChain = createChainMock(mockAssignment);
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.createGuruPengganti(tenantId, adminId, validDto);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockAssignment);
    });

    it('should reject assignment when date is in the past', async () => {
      const pastDto: CreateGuruPenggantiDto = {
        ...validDto,
        tanggal: getPastDate(),
      };

      await expect(service.createGuruPengganti(tenantId, adminId, pastDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createGuruPengganti(tenantId, adminId, pastDto)).rejects.toThrow(
        'Tanggal penugasan tidak boleh di masa lalu',
      );
    });

    it('should reject assignment when guru does not exist in tenant', async () => {
      // Guru not found
      const guruChain = createChainMock([]);
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);

      mockDb.select
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain);

      await expect(service.createGuruPengganti(tenantId, adminId, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject assignment when user is not a guru role', async () => {
      // User exists but is admin
      const guruChain = createChainMock([{ id: guruPenggantiId, role: 'admin', isActive: true }]);
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);

      mockDb.select
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain);

      await expect(service.createGuruPengganti(tenantId, adminId, validDto)).rejects.toThrow(
        'User yang dipilih bukan guru',
      );
    });

    it('should reject assignment when guru is inactive', async () => {
      // Guru exists but is inactive
      const guruChain = createChainMock([{ id: guruPenggantiId, role: 'guru', isActive: false }]);
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);

      mockDb.select
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain);

      await expect(service.createGuruPengganti(tenantId, adminId, validDto)).rejects.toThrow(
        'Guru tidak aktif',
      );
    });

    it('should reject assignment when kelas does not exist in tenant', async () => {
      const guruChain = createChainMock([{ id: guruPenggantiId, role: 'guru', isActive: true }]);
      // Kelas not found
      const kelasChain = createChainMock([]);
      const mapelChain = createChainMock([{ id: mapelId }]);

      mockDb.select
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain);

      await expect(service.createGuruPengganti(tenantId, adminId, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject assignment when mataPelajaran does not exist in tenant', async () => {
      const guruChain = createChainMock([{ id: guruPenggantiId, role: 'guru', isActive: true }]);
      const kelasChain = createChainMock([{ id: kelasId }]);
      // Mapel not found
      const mapelChain = createChainMock([]);

      mockDb.select
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain);

      await expect(service.createGuruPengganti(tenantId, adminId, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow assignment for today (not considered past)', async () => {
      const todayDto: CreateGuruPenggantiDto = {
        ...validDto,
        tanggal: getToday(),
      };

      const guruChain = createChainMock([{ id: guruPenggantiId, role: 'guru', isActive: true }]);
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);

      mockDb.select
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain);

      const insertChain = createChainMock({ ...mockAssignment, tanggal: getToday() });
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.createGuruPengganti(tenantId, adminId, todayDto);

      expect(result).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('removeGuruPengganti', () => {
    it('should delete assignment when it exists', async () => {
      const selectChain = createChainMock([{ id: assignmentId }]);
      const deleteChain = createChainMock([]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.delete.mockReturnValue(deleteChain);

      const result = await service.removeGuruPengganti(tenantId, assignmentId);

      expect(result).toEqual({ message: 'Penugasan guru pengganti berhasil dihapus' });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when assignment does not exist', async () => {
      const selectChain = createChainMock([]);
      mockDb.select.mockReturnValueOnce(selectChain);

      await expect(service.removeGuruPengganti(tenantId, assignmentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllGuruPengganti', () => {
    it('should return assignments filtered by kelasId', async () => {
      const mockResults = [
        {
          ...mockAssignment,
          guruNama: 'Pak Budi',
          kelasNama: '6A',
          mataPelajaranNama: 'Matematika',
        },
      ];
      const selectChain = createChainMock(mockResults);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findAllGuruPengganti(tenantId, { kelasId });

      expect(result).toEqual(mockResults);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return assignments filtered by tanggal', async () => {
      const mockResults = [
        {
          ...mockAssignment,
          guruNama: 'Pak Budi',
          kelasNama: '6A',
          mataPelajaranNama: 'Matematika',
        },
      ];
      const selectChain = createChainMock(mockResults);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findAllGuruPengganti(tenantId, { tanggal: getFutureDate() });

      expect(result).toEqual(mockResults);
    });

    it('should default to showing active (current and future) assignments when no tanggal filter', async () => {
      const selectChain = createChainMock([]);
      mockDb.select.mockReturnValue(selectChain);

      await service.findAllGuruPengganti(tenantId, {});

      // The where clause should include gte condition for today
      expect(selectChain.where).toHaveBeenCalled();
    });
  });

  describe('isGuruPenggantiForClassOnDate', () => {
    it('should return true when guru has active substitute assignment for today', async () => {
      const today = getToday();
      const selectChain = createChainMock([{ id: assignmentId }]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.isGuruPenggantiForClassOnDate(
        tenantId,
        guruPenggantiId,
        kelasId,
        today,
      );

      expect(result).toBe(true);
    });

    it('should return false when queried for a past date (auto-revocation)', async () => {
      const pastDate = getPastDate();

      // Should not even query DB — date-based auto-revocation
      const result = await service.isGuruPenggantiForClassOnDate(
        tenantId,
        guruPenggantiId,
        kelasId,
        pastDate,
      );

      expect(result).toBe(false);
      // No DB query should have been made
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should return false when queried for a future date', async () => {
      const futureDate = getFutureDate();

      const result = await service.isGuruPenggantiForClassOnDate(
        tenantId,
        guruPenggantiId,
        kelasId,
        futureDate,
      );

      expect(result).toBe(false);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should return false when no assignment exists for today', async () => {
      const today = getToday();
      const selectChain = createChainMock([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.isGuruPenggantiForClassOnDate(
        tenantId,
        guruPenggantiId,
        kelasId,
        today,
      );

      expect(result).toBe(false);
    });
  });
});
