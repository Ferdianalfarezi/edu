import { Test, TestingModule } from '@nestjs/testing';
import { RaporOverviewService } from './rapor-overview.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';

/**
 * RaporOverviewService Unit Tests
 * Verifies the rapor overview query logic for kepala_sekolah.
 *
 * Requirements: 38.11, 38.12
 */
describe('RaporOverviewService', () => {
  let service: RaporOverviewService;
  let mockDb: any;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tahunAjaranId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RaporOverviewService, { provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    service = module.get<RaporOverviewService>(RaporOverviewService);
  });

  // Helper to chain select → from → innerJoin → leftJoin → where → orderBy → limit
  function setupChainedQuery(returnValue: any[]) {
    const chain: any = {};
    chain.from = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.leftJoin = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockResolvedValue(returnValue);
    // If no limit, resolve the chain as the return value
    chain.then = (resolve: any) => resolve(returnValue);
    // Allow awaiting the chain directly
    Object.defineProperty(chain, Symbol.toStringTag, { value: 'Promise' });
    // Make the chain awaitable
    chain[Symbol.toPrimitive] = () => returnValue;
    return chain;
  }

  describe('getOverview', () => {
    it('should return empty array when no active tahun_ajaran and no filter', async () => {
      // First call: find active tahun_ajaran → returns empty
      const tahunAjaranChain: any = {};
      tahunAjaranChain.from = jest.fn().mockReturnValue(tahunAjaranChain);
      tahunAjaranChain.where = jest.fn().mockReturnValue(tahunAjaranChain);
      tahunAjaranChain.limit = jest.fn().mockResolvedValue([]);

      mockDb.select.mockReturnValueOnce(tahunAjaranChain);

      const result = await service.getOverview(tenantId, {});

      expect(result).toEqual([]);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('should return rapor items with status indicator when active tahun_ajaran exists', async () => {
      // Call 1: find active tahun_ajaran
      const tahunAjaranChain: any = {};
      tahunAjaranChain.from = jest.fn().mockReturnValue(tahunAjaranChain);
      tahunAjaranChain.where = jest.fn().mockReturnValue(tahunAjaranChain);
      tahunAjaranChain.limit = jest.fn().mockResolvedValue([{ id: tahunAjaranId }]);

      // Call 2: find rapor records
      const raporChain: any = {};
      raporChain.from = jest.fn().mockReturnValue(raporChain);
      raporChain.innerJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.leftJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.where = jest.fn().mockReturnValue(raporChain);
      raporChain.orderBy = jest.fn().mockResolvedValue([
        {
          raporId: 'rapor-1',
          kelasId: 'kelas-1',
          kelasNama: '1A',
          periode: 'uts_semester_1',
          tahunAjaranId: tahunAjaranId,
          tahunAjaranNama: '2024/2025',
          status: 'draft',
          finalizedBy: null,
          finalizedAt: null,
        },
        {
          raporId: 'rapor-2',
          kelasId: 'kelas-2',
          kelasNama: '2A',
          periode: 'semester_1',
          tahunAjaranId: tahunAjaranId,
          tahunAjaranNama: '2024/2025',
          status: 'final',
          finalizedBy: 'Budi Wali Kelas',
          finalizedAt: new Date('2024-12-20T10:00:00Z'),
        },
      ]);

      // Call 3 & 5: count students for kelas-1, kelas-2
      const countChain1: any = {};
      countChain1.from = jest.fn().mockReturnValue(countChain1);
      countChain1.where = jest.fn().mockResolvedValue([{ count: 30 }]);

      // Call 4 & 6: count submitted for rapor-1, rapor-2
      const submittedChain1: any = {};
      submittedChain1.from = jest.fn().mockReturnValue(submittedChain1);
      submittedChain1.where = jest.fn().mockResolvedValue([{ count: 10 }]);

      const countChain2: any = {};
      countChain2.from = jest.fn().mockReturnValue(countChain2);
      countChain2.where = jest.fn().mockResolvedValue([{ count: 25 }]);

      const submittedChain2: any = {};
      submittedChain2.from = jest.fn().mockReturnValue(submittedChain2);
      submittedChain2.where = jest.fn().mockResolvedValue([{ count: 25 }]);

      mockDb.select
        .mockReturnValueOnce(tahunAjaranChain)
        .mockReturnValueOnce(raporChain)
        .mockReturnValueOnce(countChain1)
        .mockReturnValueOnce(submittedChain1)
        .mockReturnValueOnce(countChain2)
        .mockReturnValueOnce(submittedChain2);

      const result = await service.getOverview(tenantId, {});

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        rapor_id: 'rapor-1',
        kelas_id: 'kelas-1',
        kelas_nama: '1A',
        periode: 'uts_semester_1',
        tahun_ajaran_id: tahunAjaranId,
        tahun_ajaran_nama: '2024/2025',
        status: 'draft',
        finalized_by: null,
        finalized_at: null,
        total_students: 30,
        submitted_count: 10,
      });
      expect(result[1]).toEqual({
        rapor_id: 'rapor-2',
        kelas_id: 'kelas-2',
        kelas_nama: '2A',
        periode: 'semester_1',
        tahun_ajaran_id: tahunAjaranId,
        tahun_ajaran_nama: '2024/2025',
        status: 'final',
        finalized_by: 'Budi Wali Kelas',
        finalized_at: '2024-12-20T10:00:00.000Z',
        total_students: 25,
        submitted_count: 25,
      });
    });

    it('should use provided tahun_ajaran_id filter instead of active lookup', async () => {
      const customTaId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      // No tahun_ajaran lookup needed (filter is provided directly)
      // Call 1: rapor query
      const raporChain: any = {};
      raporChain.from = jest.fn().mockReturnValue(raporChain);
      raporChain.innerJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.leftJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.where = jest.fn().mockReturnValue(raporChain);
      raporChain.orderBy = jest.fn().mockResolvedValue([]);

      mockDb.select.mockReturnValueOnce(raporChain);

      const result = await service.getOverview(tenantId, { tahun_ajaran_id: customTaId });

      expect(result).toEqual([]);
      // Should NOT call for active tahun_ajaran since filter was provided
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('should filter by kelas_id when provided', async () => {
      const kelasId = 'kelas-specific';

      // Call 1: rapor query (tahun_ajaran_id is also provided to skip lookup)
      const raporChain: any = {};
      raporChain.from = jest.fn().mockReturnValue(raporChain);
      raporChain.innerJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.leftJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.where = jest.fn().mockReturnValue(raporChain);
      raporChain.orderBy = jest.fn().mockResolvedValue([
        {
          raporId: 'rapor-x',
          kelasId: kelasId,
          kelasNama: '3B',
          periode: 'uts_semester_2',
          tahunAjaranId: tahunAjaranId,
          tahunAjaranNama: '2024/2025',
          status: 'draft',
          finalizedBy: null,
          finalizedAt: null,
        },
      ]);

      // Call 2: count students
      const countChain: any = {};
      countChain.from = jest.fn().mockReturnValue(countChain);
      countChain.where = jest.fn().mockResolvedValue([{ count: 20 }]);

      // Call 3: submitted count
      const submittedChain: any = {};
      submittedChain.from = jest.fn().mockReturnValue(submittedChain);
      submittedChain.where = jest.fn().mockResolvedValue([{ count: 5 }]);

      mockDb.select
        .mockReturnValueOnce(raporChain)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(submittedChain);

      const result = await service.getOverview(tenantId, {
        kelas_id: kelasId,
        tahun_ajaran_id: tahunAjaranId,
      });

      expect(result).toHaveLength(1);
      expect(result[0].kelas_id).toBe(kelasId);
      expect(result[0].total_students).toBe(20);
      expect(result[0].submitted_count).toBe(5);
    });

    it('should filter by periode when provided', async () => {
      // Call 1: rapor query with periode filter
      const raporChain: any = {};
      raporChain.from = jest.fn().mockReturnValue(raporChain);
      raporChain.innerJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.leftJoin = jest.fn().mockReturnValue(raporChain);
      raporChain.where = jest.fn().mockReturnValue(raporChain);
      raporChain.orderBy = jest.fn().mockResolvedValue([]);

      mockDb.select.mockReturnValueOnce(raporChain);

      const result = await service.getOverview(tenantId, {
        periode: 'semester_2',
        tahun_ajaran_id: tahunAjaranId,
      });

      expect(result).toEqual([]);
      // The where conditions should include the periode filter —
      // we verify the query chain was called properly
      expect(raporChain.where).toHaveBeenCalled();
    });
  });
});
