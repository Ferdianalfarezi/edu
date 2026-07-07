import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { TagihanService } from './tagihan.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { StorageService } from '@/modules/storage/storage.service';
import { AuditTrailService } from './audit-trail.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

/**
 * TagihanService Unit Tests — Tunggakan Dashboard & Export (Task 11.13)
 *
 * Requirements: 15.1–15.8
 */
describe('TagihanService - Tunggakan Dashboard & Export', () => {
  let service: TagihanService;
  let mockExportQueue: { add: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';

  // Sample tunggakan data
  const sampleTunggakanRows = [
    {
      id: 'aaa11111-1111-1111-1111-111111111111',
      siswaId: 'sss11111-1111-1111-1111-111111111111',
      bulan: 7,
      tahun: 2024,
      nominal: 250000,
      totalDibayar: 0,
      status: 'belum_bayar',
      tanggalJatuhTempo: '2024-07-10',
      siswa_nama: 'Ahmad Fauzi',
      siswa_status: 'aktif',
      kelas_id: kelasId,
      kelas_nama: '6A',
    },
    {
      id: 'bbb22222-2222-2222-2222-222222222222',
      siswaId: 'sss22222-2222-2222-2222-222222222222',
      bulan: 8,
      tahun: 2024,
      nominal: 250000,
      totalDibayar: 100000,
      status: 'cicilan',
      tanggalJatuhTempo: '2024-08-10',
      siswa_nama: 'Budi Santoso',
      siswa_status: 'pindah_sekolah',
      kelas_id: kelasId,
      kelas_nama: '6A',
    },
  ];

  let queryResults: any[];
  let totalResults: any[];

  const createMockDb = () => {
    // Track which query is being built
    let queryCallCount = 0;

    const buildChain = (): any => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.innerJoin = jest.fn().mockReturnValue(chain);
      chain.leftJoin = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockReturnValue(chain);
      chain.orderBy = jest.fn().mockReturnValue(chain);
      chain.limit = jest.fn().mockImplementation(() => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return Promise.resolve(queryResults);
        }
        // second select is for total
        return Promise.resolve(totalResults);
      });
      // For the sum/count query (no limit)
      chain.then = undefined; // Prevent accidental thenable
      return chain;
    };

    const selectFn = jest.fn().mockImplementation(() => {
      queryCallCount++;
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.innerJoin = jest.fn().mockReturnValue(chain);
      chain.leftJoin = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockImplementation(() => {
        if (queryCallCount === 1) {
          // First select: the main query with orderBy and limit
          const innerChain: any = {};
          innerChain.orderBy = jest.fn().mockReturnValue(innerChain);
          innerChain.limit = jest.fn().mockResolvedValue(queryResults);
          return innerChain;
        }
        // Second select: the total aggregation (no orderBy/limit)
        return Promise.resolve(totalResults);
      });
      return chain;
    });

    return {
      select: selectFn,
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    queryResults = [];
    totalResults = [{ total: 0, count: 0 }];
    mockDb = createMockDb();
    mockExportQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: { upload: jest.fn() } },
        {
          provide: KonfigurasiService,
          useValue: { getConfigByKey: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: RedisService,
          useValue: { acquireLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn() },
        },
        { provide: AuditTrailService, useValue: { record: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: mockExportQueue },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /tagihan/tunggakan (Requirements: 15.1–15.5)
  // ═══════════════════════════════════════════════════════════════════

  describe('getTunggakan', () => {
    /**
     * Requirement 15.1: Should return tagihan with status belum_bayar or cicilan.
     * Requirement 15.3: Sorted by tanggal_jatuh_tempo ASC (oldest first).
     */
    it('should return unpaid tagihan sorted by jatuh_tempo oldest first', async () => {
      queryResults = [...sampleTunggakanRows];
      totalResults = [{ total: 400000, count: 2 }];

      const result = await service.getTunggakan(tenantId, {});

      expect(result.items).toHaveLength(2);
      expect(result.items[0].siswa_nama).toBe('Ahmad Fauzi');
      expect(result.items[0].status).toBe('belum_bayar');
      expect(result.items[1].siswa_nama).toBe('Budi Santoso');
      expect(result.items[1].status).toBe('cicilan');
      expect(result.total_tunggakan).toBe(400000);
      expect(result.total_count).toBe(2);
    });

    /**
     * Requirement 15.5: Include students with status pindah_sekolah or keluar.
     */
    it('should include pindah_sekolah/keluar students in tunggakan list', async () => {
      const pindahStudent = {
        ...sampleTunggakanRows[1],
        siswa_status: 'keluar',
      };
      queryResults = [pindahStudent];
      totalResults = [{ total: 150000, count: 1 }];

      const result = await service.getTunggakan(tenantId, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].siswa_status).toBe('keluar');
      expect(result.items[0].sisa_tagihan).toBe(150000);
    });

    /**
     * Requirement 15.2: Display total nominal tunggakan across the school.
     */
    it('should return total tunggakan summary', async () => {
      queryResults = sampleTunggakanRows;
      totalResults = [{ total: 400000, count: 2 }];

      const result = await service.getTunggakan(tenantId, {});

      expect(result.total_tunggakan).toBe(400000);
      expect(result.total_count).toBe(2);
    });

    /**
     * Cursor pagination: should return next_cursor when more items exist.
     */
    it('should support cursor pagination and return next_cursor', async () => {
      // Return limit + 1 items to signal more data exists
      const manyItems = Array.from({ length: 21 }, (_, i) => ({
        ...sampleTunggakanRows[0],
        id: `item-${String(i).padStart(4, '0')}-1111-1111-1111-111111111111`,
      }));
      queryResults = manyItems;
      totalResults = [{ total: 5250000, count: 21 }];

      const result = await service.getTunggakan(tenantId, { limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.next_cursor).toBe(manyItems[19].id);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /tagihan/export (Requirements: 15.6–15.8)
  // ═══════════════════════════════════════════════════════════════════

  describe('exportTagihan', () => {
    /**
     * Requirement 15.6: Enqueue export job and return job_id.
     */
    it('should enqueue export job and return job_id', async () => {
      mockExportQueue.add.mockResolvedValue({ id: 'job-123' });

      const result = await service.exportTagihan(tenantId, userId, {
        format: 'xlsx',
        periode_bulan: 9,
        periode_tahun: 2024,
      });

      expect(result.job_id).toBe('job-123');
      expect(result.message).toContain('Export tagihan sedang diproses');
      expect(mockExportQueue.add).toHaveBeenCalledWith('export-tagihan', {
        tenantId,
        format: 'xlsx',
        periode_bulan: 9,
        periode_tahun: 2024,
        requestedBy: userId,
      });
    });

    /**
     * Requirement 15.7: Support CSV format export.
     */
    it('should support csv format export', async () => {
      mockExportQueue.add.mockResolvedValue({ id: 'job-456' });

      const result = await service.exportTagihan(tenantId, userId, {
        format: 'csv',
        periode_bulan: 10,
        periode_tahun: 2024,
      });

      expect(result.job_id).toBe('job-456');
      expect(mockExportQueue.add).toHaveBeenCalledWith('export-tagihan', {
        tenantId,
        format: 'csv',
        periode_bulan: 10,
        periode_tahun: 2024,
        requestedBy: userId,
      });
    });

    /**
     * Export without periode filters (export all tunggakan).
     */
    it('should allow export without periode filters', async () => {
      mockExportQueue.add.mockResolvedValue({ id: 'job-789' });

      const result = await service.exportTagihan(tenantId, userId, {
        format: 'xlsx',
      });

      expect(result.job_id).toBe('job-789');
      expect(mockExportQueue.add).toHaveBeenCalledWith('export-tagihan', {
        tenantId,
        format: 'xlsx',
        periode_bulan: undefined,
        periode_tahun: undefined,
        requestedBy: userId,
      });
    });
  });
});
