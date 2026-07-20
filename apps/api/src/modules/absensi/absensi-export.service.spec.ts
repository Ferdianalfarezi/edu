import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { TenantService } from '@/modules/tenant/tenant.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

describe('AbsensiService — Export Rekap Absensi (Task 8.14)', () => {
  let service: AbsensiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const kelasId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';

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

  let mockDb: any;
  let mockExportQueue: any;
  let selectCallIndex: number;

  beforeEach(async () => {
    selectCallIndex = 0;

    mockDb = {
      select: jest.fn().mockImplementation(() => {
        const idx = selectCallIndex++;
        return createChainableMock([]);
      }),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockExportQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const mockNotificationQueue = {
      add: jest.fn(),
    };

    const mockKonfigurasiService = {
      getConfigByKey: jest.fn(),
    };

    const mockJadwalService = {
      isGuruPenggantiForClassOnDate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbsensiService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
        {
          provide: KonfigurasiService,
          useValue: mockKonfigurasiService,
        },
        {
          provide: JadwalService,
          useValue: mockJadwalService,
        },
        {
          provide: TenantService,
          useValue: { getHariKerja: jest.fn().mockResolvedValue('6_hari') },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.NOTIFICATION),
          useValue: mockNotificationQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.EXPORT),
          useValue: mockExportQueue,
        },
      ],
    }).compile();

    service = module.get<AbsensiService>(AbsensiService);
  });

  /**
   * Helper: set up the mock DB to return specific results for sequential select calls.
   */
  function setupSelectMocks(...results: any[][]) {
    selectCallIndex = 0;
    const mocks = results.map((r) => createChainableMock(r));
    mockDb.select.mockImplementation(() => {
      const idx = selectCallIndex++;
      return mocks[idx] ?? createChainableMock([]);
    });
  }

  describe('exportRekapAbsensi', () => {
    it('should throw NotFoundException when kelas does not exist', async () => {
      setupSelectMocks([]); // kelas query returns empty

      await expect(
        service.exportRekapAbsensi(tenantId, userId, {
          kelas_id: kelasId,
          bulan: 10,
          tahun: 2024,
          periode: 'bulanan',
          format: 'xlsx',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockExportQueue.add).not.toHaveBeenCalled();
    });

    it('should enqueue export job and return job_id when kelas exists', async () => {
      setupSelectMocks([{ id: kelasId, nama: '6A' }]); // kelas exists

      const result = await service.exportRekapAbsensi(tenantId, userId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
        format: 'xlsx',
      });

      expect(result).toEqual({
        job_id: 'job-123',
        message: expect.any(String),
      });

      expect(mockExportQueue.add).toHaveBeenCalledWith('export-rekap-absensi', {
        tenantId,
        kelasId: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
        format: 'xlsx',
        requestedBy: userId,
      });
    });

    it('should include all required payload fields in the queued job', async () => {
      setupSelectMocks([{ id: kelasId, nama: '6A' }]); // kelas exists

      await service.exportRekapAbsensi(tenantId, userId, {
        kelas_id: kelasId,
        bulan: 3,
        tahun: 2025,
        periode: 'semester',
        format: 'xlsx',
      });

      const [jobName, jobPayload] = mockExportQueue.add.mock.calls[0];
      expect(jobName).toBe('export-rekap-absensi');
      expect(jobPayload).toEqual({
        tenantId,
        kelasId: kelasId,
        bulan: 3,
        tahun: 2025,
        periode: 'semester',
        format: 'xlsx',
        requestedBy: userId,
      });
    });

    it('should use default values for optional fields when not provided', async () => {
      setupSelectMocks([{ id: kelasId, nama: '6A' }]); // kelas exists

      await service.exportRekapAbsensi(tenantId, userId, {
        kelas_id: kelasId,
        bulan: 6,
        tahun: 2024,
      });

      const [, jobPayload] = mockExportQueue.add.mock.calls[0];
      expect(jobPayload.periode).toBe('bulanan');
      expect(jobPayload.format).toBe('xlsx');
    });
  });
});
