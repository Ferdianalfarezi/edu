import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { RaporExportService } from './rapor-export.service';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

/**
 * RaporExportService Unit Tests (Task 13.8)
 *
 * Requirements: 40.1–40.4
 */
describe('RaporExportService', () => {
  let service: RaporExportService;
  let mockExportQueue: { add: jest.Mock };
  let mockDb: any;
  let selectCallIndex: number;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const tahunAjaranId = '44444444-4444-4444-4444-444444444444';
  const raporId = '55555555-5555-5555-5555-555555555555';

  /**
   * Creates a chainable mock query builder that resolves to `result`.
   */
  const createChainableMock = (result: any[]) => {
    const chain: any = {};
    const methods = [
      'select',
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'groupBy',
      'having',
      'limit',
      'orderBy',
    ];
    for (const m of methods) {
      chain[m] = jest.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: any) => resolve(result);
    chain[Symbol.toStringTag] = 'Promise';
    return chain;
  };

  /**
   * Sets up sequential select mock results.
   */
  function setupSelectMocks(...results: any[][]) {
    selectCallIndex = 0;
    const mocks = results.map((r) => createChainableMock(r));
    mockDb.select.mockImplementation(() => {
      const idx = selectCallIndex++;
      return mocks[idx] ?? createChainableMock([]);
    });
  }

  beforeEach(async () => {
    selectCallIndex = 0;

    mockDb = {
      select: jest.fn().mockImplementation(() => createChainableMock([])),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockExportQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-abc-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RaporExportService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: mockExportQueue },
      ],
    }).compile();

    service = module.get<RaporExportService>(RaporExportService);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Requirement 40.1: Export rapor per kelas per periode
  // ═══════════════════════════════════════════════════════════════════

  describe('exportRapor — success path', () => {
    it('should enqueue export job and return job_id when rapor is final', async () => {
      // First select: kelas exists
      // Second select: rapor exists and is final
      setupSelectMocks(
        [{ id: kelasId, nama: '6A', tahunAjaranId }],
        [{ id: raporId, status: 'final' }],
      );

      const result = await service.exportRapor(tenantId, userId, {
        kelas_id: kelasId,
        periode: 'semester_1',
        format: 'xlsx',
      });

      expect(result.job_id).toBe('job-abc-123');
      expect(result.message).toContain('Export rapor sedang diproses');

      expect(mockExportQueue.add).toHaveBeenCalledWith('export-rapor', {
        tenantId,
        kelasId,
        periode: 'semester_1',
        format: 'xlsx',
        requestedBy: userId,
      });
    });

    it('should use default format xlsx when not provided', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A', tahunAjaranId }],
        [{ id: raporId, status: 'final' }],
      );

      const result = await service.exportRapor(tenantId, userId, {
        kelas_id: kelasId,
        periode: 'uts_semester_2',
      });

      expect(result.job_id).toBe('job-abc-123');

      const [, jobPayload] = mockExportQueue.add.mock.calls[0];
      expect(jobPayload.format).toBe('xlsx');
      expect(jobPayload.periode).toBe('uts_semester_2');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Requirement 40.3: Only final rapor can be exported
  // ═══════════════════════════════════════════════════════════════════

  describe('exportRapor — validation errors', () => {
    it('should throw NotFoundException when kelas does not exist', async () => {
      setupSelectMocks([]); // kelas query returns empty

      await expect(
        service.exportRapor(tenantId, userId, {
          kelas_id: kelasId,
          periode: 'semester_1',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockExportQueue.add).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when rapor does not exist', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A', tahunAjaranId }], // kelas exists
        [], // rapor not found
      );

      await expect(
        service.exportRapor(tenantId, userId, {
          kelas_id: kelasId,
          periode: 'semester_2',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockExportQueue.add).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when rapor is still draft (not final)', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A', tahunAjaranId }], // kelas exists
        [{ id: raporId, status: 'draft' }], // rapor is draft
      );

      await expect(
        service.exportRapor(tenantId, userId, {
          kelas_id: kelasId,
          periode: 'semester_1',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockExportQueue.add).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Job payload correctness
  // ═══════════════════════════════════════════════════════════════════

  describe('exportRapor — job payload', () => {
    it('should include all required fields in the export job payload', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A', tahunAjaranId }],
        [{ id: raporId, status: 'final' }],
      );

      await service.exportRapor(tenantId, userId, {
        kelas_id: kelasId,
        periode: 'uts_semester_1',
        format: 'xlsx',
      });

      const [jobName, jobPayload] = mockExportQueue.add.mock.calls[0];
      expect(jobName).toBe('export-rapor');
      expect(jobPayload).toEqual({
        tenantId,
        kelasId,
        periode: 'uts_semester_1',
        format: 'xlsx',
        requestedBy: userId,
      });
    });
  });
});
