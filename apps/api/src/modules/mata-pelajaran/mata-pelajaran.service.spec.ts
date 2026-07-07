import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MataPelajaranService } from './mata-pelajaran.service';
import { DrizzleService } from '@/drizzle/drizzle.service';

describe('MataPelajaranService', () => {
  let service: MataPelajaranService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const mapelId = '22222222-2222-2222-2222-222222222222';
  const tahunAjaranId = '33333333-3333-3333-3333-333333333333';

  // Mock database operation results
  const mockMapel = {
    id: mapelId,
    tenantId,
    nama: 'Matematika',
    kode: 'MTK',
    createdAt: new Date(),
  };

  // Chain-able query builder mock
  const createChainMock = (returnValue: unknown = []) => {
    const chain: Record<string, jest.Mock> = {};
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.values = jest.fn().mockReturnValue(chain);
    chain.set = jest.fn().mockReturnValue(chain);
    chain.returning = jest
      .fn()
      .mockResolvedValue(Array.isArray(returnValue) ? returnValue : [returnValue]);
    // For select queries that resolve as arrays directly
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
        MataPelajaranService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
      ],
    }).compile();

    service = module.get<MataPelajaranService>(MataPelajaranService);
  });

  describe('create', () => {
    it('should create a mata pelajaran with nama and kode', async () => {
      const chain = createChainMock(mockMapel);
      mockDb.insert.mockReturnValue(chain);

      const result = await service.create(tenantId, {
        nama: 'Matematika',
        kode: 'MTK',
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalledWith({
        tenantId,
        nama: 'Matematika',
        kode: 'MTK',
      });
      expect(result).toEqual(mockMapel);
    });

    it('should create a mata pelajaran with kode as null when not provided', async () => {
      const chain = createChainMock({ ...mockMapel, kode: null });
      mockDb.insert.mockReturnValue(chain);

      const result = await service.create(tenantId, {
        nama: 'Bahasa Indonesia',
      });

      expect(chain.values).toHaveBeenCalledWith({
        tenantId,
        nama: 'Bahasa Indonesia',
        kode: null,
      });
      expect(result.kode).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all mata pelajaran for a tenant', async () => {
      const mapelList = [mockMapel, { ...mockMapel, id: 'other-id', nama: 'Fisika' }];
      const chain = createChainMock(mapelList);
      mockDb.select.mockReturnValue(chain);

      const result = await service.findAll(tenantId);

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(mapelList);
    });

    it('should return empty array when no mata pelajaran exist', async () => {
      const chain = createChainMock([]);
      mockDb.select.mockReturnValue(chain);

      const result = await service.findAll(tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a mata pelajaran by id and tenant', async () => {
      const chain = createChainMock([mockMapel]);
      mockDb.select.mockReturnValue(chain);

      const result = await service.findOne(tenantId, mapelId);

      expect(result).toEqual(mockMapel);
    });

    it('should throw NotFoundException when mata pelajaran not found', async () => {
      const chain = createChainMock([]);
      mockDb.select.mockReturnValue(chain);

      await expect(service.findOne(tenantId, mapelId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update nama of a mata pelajaran', async () => {
      const updatedMapel = { ...mockMapel, nama: 'Matematika Lanjutan' };
      // First call is findOne (verify existence)
      const selectChain = createChainMock([mockMapel]);
      mockDb.select.mockReturnValue(selectChain);
      // Update call
      const updateChain = createChainMock(updatedMapel);
      mockDb.update.mockReturnValue(updateChain);

      const result = await service.update(tenantId, mapelId, {
        nama: 'Matematika Lanjutan',
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual(updatedMapel);
    });

    it('should update kode of a mata pelajaran', async () => {
      const updatedMapel = { ...mockMapel, kode: 'MTK-2' };
      const selectChain = createChainMock([mockMapel]);
      mockDb.select.mockReturnValue(selectChain);
      const updateChain = createChainMock(updatedMapel);
      mockDb.update.mockReturnValue(updateChain);

      const result = await service.update(tenantId, mapelId, {
        kode: 'MTK-2',
      });

      expect(result).toEqual(updatedMapel);
    });

    it('should return current data when no fields to update', async () => {
      const selectChain = createChainMock([mockMapel]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.update(tenantId, mapelId, {});

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(result).toEqual(mockMapel);
    });

    it('should throw NotFoundException if mata pelajaran does not exist', async () => {
      const selectChain = createChainMock([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.update(tenantId, mapelId, { nama: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete mata pelajaran when no active jadwal references it', async () => {
      // findOne returns the mapel
      const selectChain1 = createChainMock([mockMapel]);
      // tahunAjaran query returns active TA
      const selectChain2 = createChainMock([{ id: tahunAjaranId, tenantId, status: 'aktif' }]);
      // jadwal query returns empty (no active jadwal)
      const selectChain3 = createChainMock([]);
      // delete chain
      const deleteChain = createChainMock([]);

      mockDb.select
        .mockReturnValueOnce(selectChain1) // findOne
        .mockReturnValueOnce(selectChain2) // tahunAjaran
        .mockReturnValueOnce(selectChain3); // jadwal check
      mockDb.delete.mockReturnValue(deleteChain);

      const result = await service.remove(tenantId, mapelId);

      expect(result).toEqual({ message: 'Mata pelajaran berhasil dihapus' });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should delete mata pelajaran when no active tahun ajaran exists', async () => {
      // findOne returns the mapel
      const selectChain1 = createChainMock([mockMapel]);
      // tahunAjaran query returns empty (no active TA)
      const selectChain2 = createChainMock([]);
      // delete chain
      const deleteChain = createChainMock([]);

      mockDb.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);
      mockDb.delete.mockReturnValue(deleteChain);

      const result = await service.remove(tenantId, mapelId);

      expect(result).toEqual({ message: 'Mata pelajaran berhasil dihapus' });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should reject deletion when active jadwal references the mata pelajaran', async () => {
      const activeJadwal = [
        {
          id: 'jadwal-1',
          hari: 'senin',
          jamMulai: '08:00',
          jamSelesai: '09:30',
          kelasNama: '6A',
        },
        {
          id: 'jadwal-2',
          hari: 'rabu',
          jamMulai: '10:00',
          jamSelesai: '11:30',
          kelasNama: '6B',
        },
      ];

      // findOne returns the mapel
      const selectChain1 = createChainMock([mockMapel]);
      // tahunAjaran query returns active TA
      const selectChain2 = createChainMock([{ id: tahunAjaranId, tenantId, status: 'aktif' }]);
      // jadwal query returns active jadwal
      const selectChain3 = createChainMock(activeJadwal);

      mockDb.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2)
        .mockReturnValueOnce(selectChain3);

      await expect(service.remove(tenantId, mapelId)).rejects.toThrow(BadRequestException);

      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should include affected jadwal list in error when deletion is rejected', async () => {
      const activeJadwal = [
        {
          id: 'jadwal-1',
          hari: 'senin',
          jamMulai: '08:00',
          jamSelesai: '09:30',
          kelasNama: '6A',
        },
      ];

      const selectChain1 = createChainMock([mockMapel]);
      const selectChain2 = createChainMock([{ id: tahunAjaranId, tenantId, status: 'aktif' }]);
      const selectChain3 = createChainMock(activeJadwal);

      mockDb.select
        .mockReturnValueOnce(selectChain1)
        .mockReturnValueOnce(selectChain2)
        .mockReturnValueOnce(selectChain3);

      try {
        await service.remove(tenantId, mapelId);
        fail('Expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse();
        expect(response).toHaveProperty('jadwal');
        expect((response as Record<string, unknown>).jadwal).toContain('6A - senin (08:00-09:30)');
      }
    });

    it('should throw NotFoundException if mata pelajaran does not exist', async () => {
      const selectChain = createChainMock([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.remove(tenantId, mapelId)).rejects.toThrow(NotFoundException);
    });
  });
});
