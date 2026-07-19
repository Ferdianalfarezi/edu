import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JadwalService } from './jadwal.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { TenantService } from '@/modules/tenant/tenant.service';
import { CreateJadwalDto } from './dto';

describe('JadwalService', () => {
  let service: JadwalService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const jadwalId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';
  const guruId = '55555555-5555-5555-5555-555555555555';
  const tahunAjaranId = '66666666-6666-6666-6666-666666666666';

  const mockJadwal = {
    id: jadwalId,
    tenantId,
    kelasId,
    mataPelajaranId: mapelId,
    guruId,
    tahunAjaranId,
    semester: 1,
    hari: 'senin',
    jamMulai: '08:00',
    jamSelesai: '09:30',
    tanggalMulaiBerlaku: '2024-07-15',
    tanggalSelesaiBerlaku: '2024-12-20',
    isVacant: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJadwalWithJoins = {
    ...mockJadwal,
    kelasNama: '6A',
    mataPelajaranNama: 'Matematika',
    mataPelajaranKode: 'MTK',
    guruNama: 'Pak Budi',
  };

  // Expected snake_case response from findOne
  const expectedFindOneResponse = {
    id: jadwalId,
    kelas_id: kelasId,
    mata_pelajaran_id: mapelId,
    guru_id: guruId,
    hari: 'senin',
    jam_mulai: '08:00',
    jam_selesai: '09:30',
    is_vacant: false,
    is_istirahat: false,
    mata_pelajaran: { id: mapelId, nama: 'Matematika', kode: 'MTK' },
    guru: { id: guruId, nama: 'Pak Budi' },
  };

  const validCreateDto: CreateJadwalDto = {
    kelasId,
    mataPelajaranId: mapelId,
    guruId,
    tahunAjaranId,
    semester: 1,
    hari: 'senin',
    jamMulai: '08:00',
    jamSelesai: '09:30',
    tanggalMulaiBerlaku: '2024-07-15',
    tanggalSelesaiBerlaku: '2024-12-20',
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

  describe('create', () => {
    it('should create a jadwal pelajaran when all references are valid', async () => {
      // Mock validation queries: kelas, mapel, guru, tahunAjaran all found
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      const guruChain = createChainMock([{ id: guruId, role: 'guru' }]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      // Mock insert
      const insertChain = createChainMock(mockJadwal);
      mockDb.insert.mockReturnValue(insertChain);

      const result = await service.create(tenantId, adminId, validCreateDto);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(mockJadwal);
    });

    it('should reject when kelas does not exist in tenant', async () => {
      // Kelas not found
      const kelasChain = createChainMock([]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      const guruChain = createChainMock([{ id: guruId, role: 'guru' }]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      await expect(service.create(tenantId, adminId, validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when guru does not exist in tenant', async () => {
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      // Guru not found
      const guruChain = createChainMock([]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      await expect(service.create(tenantId, adminId, validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when user is not a guru role', async () => {
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      // User exists but is admin, not guru
      const guruChain = createChainMock([{ id: guruId, role: 'admin' }]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      await expect(service.create(tenantId, adminId, validCreateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when jamSelesai is not greater than jamMulai', async () => {
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      const guruChain = createChainMock([{ id: guruId, role: 'guru' }]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      const badDto = { ...validCreateDto, jamMulai: '10:00', jamSelesai: '09:00' };

      await expect(service.create(tenantId, adminId, badDto)).rejects.toThrow(BadRequestException);
    });

    it('should reject when tanggalSelesaiBerlaku is not after tanggalMulaiBerlaku', async () => {
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      const guruChain = createChainMock([{ id: guruId, role: 'guru' }]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      const badDto = {
        ...validCreateDto,
        tanggalMulaiBerlaku: '2024-12-20',
        tanggalSelesaiBerlaku: '2024-07-15',
      };

      await expect(service.create(tenantId, adminId, badDto)).rejects.toThrow(BadRequestException);
    });

    it('should allow guru to teach multiple classes at the same time (no conflict check)', async () => {
      // This test verifies Requirement 27.3: No conflict validation needed.
      // The service should NOT check for time conflicts.
      const kelasChain = createChainMock([{ id: kelasId }]);
      const mapelChain = createChainMock([{ id: mapelId }]);
      const guruChain = createChainMock([{ id: guruId, role: 'guru' }]);
      const taChain = createChainMock([{ id: tahunAjaranId }]);

      mockDb.select
        .mockReturnValueOnce(kelasChain)
        .mockReturnValueOnce(mapelChain)
        .mockReturnValueOnce(guruChain)
        .mockReturnValueOnce(taChain);

      const insertChain = createChainMock(mockJadwal);
      mockDb.insert.mockReturnValue(insertChain);

      // Should succeed even if guru already has a jadwal at the same time
      // (no conflict validation per Requirement 27.3)
      const result = await service.create(tenantId, adminId, validCreateDto);

      expect(result).toEqual(mockJadwal);
      // Verify no extra queries were made to check for conflicts
      expect(mockDb.select).toHaveBeenCalledTimes(4); // Only validation queries
    });
  });

  describe('findOne', () => {
    it('should return a jadwal with joined kelas, mapel, and guru names', async () => {
      const selectChain = createChainMock([mockJadwalWithJoins]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findOne(tenantId, jadwalId);

      expect(result).toEqual(expectedFindOneResponse);
    });

    it('should throw NotFoundException when jadwal not found', async () => {
      const selectChain = createChainMock([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.findOne(tenantId, jadwalId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all jadwal for a tenant with no filters', async () => {
      const jadwalList = [mockJadwalWithJoins];
      const selectChain = createChainMock(jadwalList);
      // First call: main query, subsequent calls: guru_pengganti queries (return empty)
      const emptyChain = createChainMock([]);
      mockDb.select.mockReturnValueOnce(selectChain).mockReturnValue(emptyChain);

      const result = await service.findAll(tenantId, {});

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].kelas_id).toBe(kelasId);
      expect(result[0].guru).toEqual({ id: guruId, nama: 'Pak Budi' });
      expect(result[0].mata_pelajaran).toEqual({ id: mapelId, nama: 'Matematika', kode: 'MTK' });
      expect(result[0].guru_pengganti_aktif).toBeNull();
    });

    it('should apply filters when provided', async () => {
      const jadwalList = [mockJadwalWithJoins];
      const selectChain = createChainMock(jadwalList);
      const emptyChain = createChainMock([]);
      mockDb.select.mockReturnValueOnce(selectChain).mockReturnValue(emptyChain);

      const result = await service.findAll(tenantId, {
        kelasId,
        semester: 1,
        hari: 'senin',
      });

      expect(result).toHaveLength(1);
      expect(selectChain.where).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update jadwal guru and track updatedAt timestamp', async () => {
      const newGuruId = '77777777-7777-7777-7777-777777777777';

      // findOneRaw — existing jadwal
      const rawChain = createChainMock([mockJadwal]);
      // validateGuru — new guru exists
      const guruChain = createChainMock([{ id: newGuruId, role: 'guru' }]);
      // update chain
      const updateChain = createChainMock(mockJadwal);
      // findOne after update (with joins)
      const findOneChain = createChainMock([
        { ...mockJadwalWithJoins, guruId: newGuruId, guruNama: 'Pak Baru' },
      ]);

      mockDb.select
        .mockReturnValueOnce(rawChain) // findOneRaw
        .mockReturnValueOnce(guruChain) // validateGuru
        .mockReturnValueOnce(findOneChain); // findOne (return)
      mockDb.update.mockReturnValue(updateChain);

      const result = await service.update(tenantId, jadwalId, adminId, {
        guruId: newGuruId,
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          guruId: newGuruId,
          updatedAt: expect.any(Date),
        }),
      );
      expect(result.guru_id).toBe(newGuruId);
      expect(result.guru).toEqual({ id: newGuruId, nama: 'Pak Baru' });
    });

    it('should throw NotFoundException when jadwal does not exist', async () => {
      const rawChain = createChainMock([]);
      mockDb.select.mockReturnValueOnce(rawChain);

      await expect(
        service.update(tenantId, jadwalId, adminId, { guruId: 'some-id' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject update if resulting jamSelesai <= jamMulai', async () => {
      const rawChain = createChainMock([mockJadwal]); // existing has 08:00-09:30
      mockDb.select.mockReturnValueOnce(rawChain);

      // Try to set jamSelesai before existing jamMulai
      await expect(
        service.update(tenantId, jadwalId, adminId, { jamSelesai: '07:00' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return current data when no fields to update', async () => {
      const rawChain = createChainMock([mockJadwal]);
      const findOneChain = createChainMock([mockJadwalWithJoins]);

      mockDb.select
        .mockReturnValueOnce(rawChain) // findOneRaw
        .mockReturnValueOnce(findOneChain); // findOne

      const result = await service.update(tenantId, jadwalId, adminId, {});

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(result).toEqual(expectedFindOneResponse);
    });
  });

  describe('remove', () => {
    it('should delete jadwal when it exists', async () => {
      const rawChain = createChainMock([mockJadwal]);
      const deleteChain = createChainMock([]);

      mockDb.select.mockReturnValueOnce(rawChain);
      mockDb.delete.mockReturnValue(deleteChain);

      const result = await service.remove(tenantId, jadwalId);

      expect(result).toEqual({ message: 'Jadwal pelajaran berhasil dihapus' });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when jadwal does not exist', async () => {
      const rawChain = createChainMock([]);
      mockDb.select.mockReturnValueOnce(rawChain);

      await expect(service.remove(tenantId, jadwalId)).rejects.toThrow(NotFoundException);
    });

    it('should preserve historical jadwal by only deleting explicitly requested entries', async () => {
      // This test verifies Requirement 27.10: Historical jadwal preservation.
      // Old jadwal entries are NOT auto-deleted. Only explicit delete removes them.
      const rawChain = createChainMock([mockJadwal]);
      const deleteChain = createChainMock([]);

      mockDb.select.mockReturnValueOnce(rawChain);
      mockDb.delete.mockReturnValue(deleteChain);

      await service.remove(tenantId, jadwalId);

      // Verify delete was called with specific ID, not a bulk operation
      expect(deleteChain.where).toHaveBeenCalled();
    });
  });
});
