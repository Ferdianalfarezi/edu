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
 * TagihanService Unit Tests — Tunggakan Dashboard & Export (Task 10.1, 11.13)
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 15.1–15.5
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
  // exportTagihanFile & exportTunggakan (Requirements: 9.1, 9.2, 9.3, 9.4)
  // ═══════════════════════════════════════════════════════════════════

  describe('exportTagihanFile', () => {
    const exportRows = [
      {
        siswa_nama: 'Ahmad Fauzi',
        kelas_nama: '6A',
        bulan: 7,
        tahun: 2024,
        nominal: 250000,
        total_dibayar: 0,
        status: 'belum_bayar',
        tanggal_jatuh_tempo: '2024-07-10',
      },
    ];

    beforeEach(() => {
      // Provide two selects: main data query and tenant name query
      let callCount = 0;
      mockDb.select = jest.fn().mockImplementation(() => {
        callCount++;
        const chain: any = {};
        chain.from = jest.fn().mockReturnValue(chain);
        chain.innerJoin = jest.fn().mockReturnValue(chain);
        chain.leftJoin = jest.fn().mockReturnValue(chain);
        chain.where = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockImplementation(() => {
          if (callCount === 1) return Promise.resolve(exportRows);
          // tenant name lookup
          return Promise.resolve([{ nama: 'SD Negeri 1' }]);
        });
        return chain;
      });
    });

    /**
     * Requirement 9.1, 9.3: XLSX export returns buffer with correct filename.
     */
    it('should return xlsx buffer with correct filename', async () => {
      const result = await service.exportTagihanFile({}, 'xlsx', tenantId);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toMatch(/^tagihan_list_\d{8}\.xlsx$/);
    });

    /**
     * Requirement 9.4: PDF export returns buffer with correct filename.
     */
    it('should return pdf buffer with correct filename', async () => {
      const result = await service.exportTagihanFile({}, 'pdf', tenantId);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toMatch(/^tagihan_list_\d{8}\.pdf$/);
    });
  });

  describe('exportTunggakan', () => {
    const exportRows = [
      {
        siswa_nama: 'Budi Santoso',
        kelas_nama: '5B',
        bulan: 8,
        tahun: 2024,
        nominal: 250000,
        total_dibayar: 100000,
        status: 'cicilan',
        tanggal_jatuh_tempo: '2024-08-10',
      },
    ];

    beforeEach(() => {
      let callCount = 0;
      mockDb.select = jest.fn().mockImplementation(() => {
        callCount++;
        const chain: any = {};
        chain.from = jest.fn().mockReturnValue(chain);
        chain.innerJoin = jest.fn().mockReturnValue(chain);
        chain.leftJoin = jest.fn().mockReturnValue(chain);
        chain.where = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockImplementation(() => {
          if (callCount === 1) return Promise.resolve(exportRows);
          return Promise.resolve([{ nama: 'SD Negeri 1' }]);
        });
        return chain;
      });
    });

    /**
     * Requirement 9.2, 9.3: Tunggakan XLSX export returns buffer with correct filename.
     */
    it('should return xlsx buffer with tunggakan filename', async () => {
      const result = await service.exportTunggakan({}, 'xlsx', tenantId);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toMatch(/^tagihan_tunggakan_\d{8}\.xlsx$/);
    });

    /**
     * Requirement 9.2, 9.4: Tunggakan PDF export returns buffer with correct filename.
     */
    it('should return pdf buffer with tunggakan filename', async () => {
      const result = await service.exportTunggakan({}, 'pdf', tenantId);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.filename).toMatch(/^tagihan_tunggakan_\d{8}\.pdf$/);
    });
  });
});
