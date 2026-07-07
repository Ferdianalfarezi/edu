import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TahunAjaranService } from './tahun-ajaran.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { KelasService } from '@/modules/kelas/kelas.service';

describe('TahunAjaranService', () => {
  let service: TahunAjaranService;
  let mockDb: any;
  let mockKelasService: any;

  const TENANT_ID = 'tenant-uuid-1';

  /**
   * Creates a chainable mock that also acts as a Promise.
   * Drizzle queries are thenable — awaiting them resolves the query.
   * The mock resolves at any terminal point (where, orderBy, limit).
   */
  function createSelectChain(results: any[] = []) {
    const chain: any = {};
    const thenableResult = Promise.resolve(results);

    // Make the chain itself thenable
    chain.then = (resolve: any, reject: any) => thenableResult.then(resolve, reject);
    chain.catch = (reject: any) => thenableResult.catch(reject);

    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);

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
    const thenableResult = Promise.resolve(undefined);
    chain.then = (resolve: any, reject: any) => thenableResult.then(resolve, reject);
    chain.catch = (reject: any) => thenableResult.catch(reject);

    chain.set = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    return chain;
  }

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockKelasService = {
      duplicateClassStructure: jest.fn().mockResolvedValue({ duplicated: 0 }),
      countByTahunAjaran: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TahunAjaranService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: KelasService, useValue: mockKelasService },
      ],
    }).compile();

    service = module.get<TahunAjaranService>(TahunAjaranService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      nama: '2024/2025',
      tanggal_mulai: '2024-07-15',
      tanggal_selesai: '2025-06-30',
    };

    it('should create a tahun ajaran with status disiapkan', async () => {
      const createdTahunAjaran = {
        id: 'ta-new-id',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        tanggalMulai: '2024-07-15',
        tanggalSelesai: '2025-06-30',
        status: 'disiapkan',
        createdAt: new Date(),
      };

      const insertChain = createInsertChain([createdTahunAjaran]);
      mockDb.insert.mockReturnValue(insertChain);

      // select for active tahun ajaran → none found
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.create(TENANT_ID, createDto);

      expect(result.id).toBe('ta-new-id');
      expect(result.status).toBe('disiapkan');
      expect(result.duplicatedClassCount).toBe(0);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should duplicate class structure from active tahun ajaran on creation', async () => {
      const createdTahunAjaran = {
        id: 'ta-new-id',
        tenantId: TENANT_ID,
        nama: '2025/2026',
        tanggalMulai: '2025-07-15',
        tanggalSelesai: '2026-06-30',
        status: 'disiapkan',
        createdAt: new Date(),
      };

      const activeTahunAjaran = {
        id: 'ta-active-id',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        status: 'aktif',
      };

      const insertChain = createInsertChain([createdTahunAjaran]);
      mockDb.insert.mockReturnValue(insertChain);

      // select for active tahun ajaran → found one
      const selectChain = createSelectChain([activeTahunAjaran]);
      mockDb.select.mockReturnValue(selectChain);

      mockKelasService.duplicateClassStructure.mockResolvedValue({ duplicated: 5 });

      const result = await service.create(TENANT_ID, createDto);

      expect(result.duplicatedClassCount).toBe(5);
      expect(mockKelasService.duplicateClassStructure).toHaveBeenCalledWith(
        TENANT_ID,
        'ta-active-id',
        'ta-new-id',
      );
    });

    it('should throw BadRequestException if tanggal_mulai >= tanggal_selesai', async () => {
      const invalidDto = {
        nama: '2024/2025',
        tanggal_mulai: '2025-06-30',
        tanggal_selesai: '2024-07-15',
      };

      await expect(service.create(TENANT_ID, invalidDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(TENANT_ID, invalidDto)).rejects.toThrow(
        'Tanggal mulai harus sebelum tanggal selesai',
      );
    });

    it('should throw BadRequestException if tanggal_mulai equals tanggal_selesai', async () => {
      const invalidDto = {
        nama: '2024/2025',
        tanggal_mulai: '2024-07-15',
        tanggal_selesai: '2024-07-15',
      };

      await expect(service.create(TENANT_ID, invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('should not call duplicateClassStructure when no active tahun ajaran exists', async () => {
      const createdTahunAjaran = {
        id: 'ta-new-id',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        tanggalMulai: '2024-07-15',
        tanggalSelesai: '2025-06-30',
        status: 'disiapkan',
        createdAt: new Date(),
      };

      const insertChain = createInsertChain([createdTahunAjaran]);
      mockDb.insert.mockReturnValue(insertChain);

      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await service.create(TENANT_ID, createDto);

      expect(mockKelasService.duplicateClassStructure).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all tahun ajaran for a tenant ordered by tanggal_mulai', async () => {
      const tahunAjaranList = [
        { id: 'ta-1', nama: '2023/2024', status: 'nonaktif' },
        { id: 'ta-2', nama: '2024/2025', status: 'aktif' },
      ];

      const selectChain = createSelectChain(tahunAjaranList);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findAll(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].nama).toBe('2023/2024');
      expect(result[1].nama).toBe('2024/2025');
    });

    it('should return empty array when no tahun ajaran exists', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      const result = await service.findAll(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return tahun ajaran detail with kelas count', async () => {
      const ta = {
        id: 'ta-1',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        tanggalMulai: '2024-07-15',
        tanggalSelesai: '2025-06-30',
        status: 'aktif',
        createdAt: new Date(),
      };

      const selectChain = createSelectChain([ta]);
      mockDb.select.mockReturnValue(selectChain);

      mockKelasService.countByTahunAjaran.mockResolvedValue(6);

      const result = await service.findOne(TENANT_ID, 'ta-1');

      expect(result.id).toBe('ta-1');
      expect(result.nama).toBe('2024/2025');
      expect(result.kelasCount).toBe(6);
      expect(mockKelasService.countByTahunAjaran).toHaveBeenCalledWith(TENANT_ID, 'ta-1');
    });

    it('should throw NotFoundException if tahun ajaran not found', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.findOne(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(TENANT_ID, 'nonexistent')).rejects.toThrow(
        'Tahun ajaran dengan id nonexistent tidak ditemukan',
      );
    });
  });

  describe('activate', () => {
    it('should activate a tahun ajaran and deactivate the previous active one', async () => {
      const target = {
        id: 'ta-new',
        tenantId: TENANT_ID,
        nama: '2025/2026',
        status: 'disiapkan',
      };

      const previousActive = {
        id: 'ta-active',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        status: 'aktif',
      };

      // First select: find the target
      const selectChainTarget = createSelectChain([target]);
      // Second select: find currently active
      const selectChainActive = createSelectChain([previousActive]);
      mockDb.select.mockReturnValueOnce(selectChainTarget).mockReturnValueOnce(selectChainActive);

      // Two update calls: deactivate previous, activate target
      const updateChain1 = createUpdateChain();
      const updateChain2 = createUpdateChain();
      mockDb.update.mockReturnValueOnce(updateChain1).mockReturnValueOnce(updateChain2);

      const result = await service.activate(TENANT_ID, 'ta-new');

      expect(result.id).toBe('ta-new');
      expect(result.status).toBe('aktif');
      expect(result.previousActiveId).toBe('ta-active');
      expect(mockDb.update).toHaveBeenCalledTimes(2);
    });

    it('should activate without deactivating when no previous active exists', async () => {
      const target = {
        id: 'ta-first',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        status: 'disiapkan',
      };

      // First select: find the target
      const selectChainTarget = createSelectChain([target]);
      // Second select: no active tahun ajaran
      const selectChainActive = createSelectChain([]);
      mockDb.select.mockReturnValueOnce(selectChainTarget).mockReturnValueOnce(selectChainActive);

      // Only one update call: activate target
      const updateChain = createUpdateChain();
      mockDb.update.mockReturnValue(updateChain);

      const result = await service.activate(TENANT_ID, 'ta-first');

      expect(result.id).toBe('ta-first');
      expect(result.status).toBe('aktif');
      expect(result.previousActiveId).toBeNull();
      expect(mockDb.update).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if target tahun ajaran not found', async () => {
      const selectChain = createSelectChain([]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.activate(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if target is already aktif', async () => {
      const target = {
        id: 'ta-active',
        tenantId: TENANT_ID,
        nama: '2024/2025',
        status: 'aktif',
      };

      const selectChain = createSelectChain([target]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.activate(TENANT_ID, 'ta-active')).rejects.toThrow(BadRequestException);
      await expect(service.activate(TENANT_ID, 'ta-active')).rejects.toThrow(
        'Tahun ajaran ini sudah aktif',
      );
    });

    it('should throw BadRequestException if target has status nonaktif', async () => {
      const target = {
        id: 'ta-old',
        tenantId: TENANT_ID,
        nama: '2022/2023',
        status: 'nonaktif',
      };

      const selectChain = createSelectChain([target]);
      mockDb.select.mockReturnValue(selectChain);

      await expect(service.activate(TENANT_ID, 'ta-old')).rejects.toThrow(BadRequestException);
      await expect(service.activate(TENANT_ID, 'ta-old')).rejects.toThrow(
        'Hanya tahun ajaran dengan status "disiapkan" yang dapat diaktifkan',
      );
    });
  });
});
