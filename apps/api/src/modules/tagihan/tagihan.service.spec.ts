import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TagihanService } from './tagihan.service';
import { AuditTrailService } from './audit-trail.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { StorageService } from '@/modules/storage/storage.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { GenerateTagihanDto } from './dto';

/**
 * TagihanService Unit Tests — Generate Tagihan (POST /tagihan/generate)
 *
 * Requirements: 9.1–9.7, 10.1–10.5
 */
describe('TagihanService - generateTagihan', () => {
  let service: TagihanService;
  let mockRedisService: {
    acquireLock: jest.Mock;
    releaseLock: jest.Mock;
  };
  let mockNotificationQueue: { add: jest.Mock };
  let mockKonfigurasiService: {
    getConfigByKey: jest.Mock;
  };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tahunAjaranId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const kelasId1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const siswaId1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const siswaId2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const orangTuaId1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const activeTahunAjaran = {
    id: tahunAjaranId,
    tenantId,
    nama: '2024/2025',
    tanggalMulai: '2024-07-01',
    tanggalSelesai: '2025-06-30',
    status: 'aktif',
    createdAt: new Date(),
  };

  const activeStudents = [
    { id: siswaId1, kelasId: kelasId1, nama: 'Budi', orangTuaId: orangTuaId1, tingkat: 1 },
    { id: siswaId2, kelasId: kelasId1, nama: 'Sari', orangTuaId: orangTuaId1, tingkat: 1 },
  ];

  let selectCallIndex: number;
  let selectResults: any[][];
  let insertResult: any[];

  const createMockDb = () => {
    selectCallIndex = 0;

    const selectChain: any = {};
    selectChain.from = jest.fn().mockReturnValue(selectChain);
    selectChain.innerJoin = jest.fn().mockReturnValue(selectChain);
    selectChain.limit = jest.fn().mockImplementation(() => {
      const result = selectResults[selectCallIndex] || [];
      selectCallIndex++;
      return Promise.resolve(result);
    });
    selectChain.where = jest.fn().mockImplementation(() => {
      const result = selectResults[selectCallIndex] || [];
      selectCallIndex++;
      return Promise.resolve(result);
    });

    const insertChain: any = {};
    insertChain.values = jest.fn().mockReturnValue(insertChain);
    insertChain.onConflictDoNothing = jest.fn().mockReturnValue(insertChain);
    insertChain.returning = jest.fn().mockImplementation(() => Promise.resolve(insertResult));

    return {
      select: jest.fn().mockReturnValue(selectChain),
      insert: jest.fn().mockReturnValue(insertChain),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    insertResult = [];
    mockDb = createMockDb();
    mockRedisService = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    mockNotificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockKonfigurasiService = {
      getConfigByKey: jest.fn().mockImplementation((_tenantId: string, key: string) => {
        if (key === 'nominal_spp') {
          return Promise.resolve({
            key: 'nominal_spp',
            value: { tingkat_1: 250000, tingkat_2: 275000, tingkat_3: 300000 },
          });
        }
        if (key === 'tanggal_jatuh_tempo') {
          return Promise.resolve({
            key: 'tanggal_jatuh_tempo',
            value: { hari: 10 },
          });
        }
        throw new NotFoundException(`Key ${key} not found`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: { upload: jest.fn() } },
        { provide: KonfigurasiService, useValue: mockKonfigurasiService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuditTrailService, useValue: { record: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockNotificationQueue },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  describe('Input validation', () => {
    /**
     * Must provide either tahun_ajaran_id OR (bulan + tahun).
     */
    it('should throw BadRequestException when neither tahun_ajaran_id nor bulan+tahun provided', async () => {
      const dto: GenerateTagihanDto = {};

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(BadRequestException);
      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(
        'Harus menyediakan tahun_ajaran_id atau bulan + tahun',
      );
    });

    /**
     * Providing only bulan without tahun should throw.
     */
    it('should throw BadRequestException when bulan provided without tahun', async () => {
      const dto: GenerateTagihanDto = { bulan: 7 };

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(BadRequestException);
    });

    /**
     * Providing only tahun without bulan should throw.
     */
    it('should throw BadRequestException when tahun provided without bulan', async () => {
      const dto: GenerateTagihanDto = { tahun: 2024 };

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Redis distributed lock (ADR-007)', () => {
    /**
     * When lock cannot be acquired, should throw ConflictException.
     * Prevents concurrent generation for same tenant+tahunAjaran.
     */
    it('should throw ConflictException when Redis lock cannot be acquired', async () => {
      mockRedisService.acquireLock.mockResolvedValue(false);

      // Set up for per-month mode (need active tahun ajaran)
      selectResults = [[activeTahunAjaran]]; // getActiveTahunAjaran

      const dto: GenerateTagihanDto = { bulan: 7, tahun: 2024 };

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(ConflictException);
    });

    it('should include descriptive error message in ConflictException', async () => {
      mockRedisService.acquireLock.mockResolvedValue(false);
      selectResults = [[activeTahunAjaran]];

      const dto: GenerateTagihanDto = { bulan: 7, tahun: 2024 };

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(
        'Proses generate tagihan sedang berjalan',
      );
    });

    /**
     * Lock should be released after processing (even on error in processGeneration).
     */
    it('should always release lock after processing', async () => {
      // Per-month mode
      selectResults = [
        [activeTahunAjaran], // getActiveTahunAjaran
        [], // activeStudents query (empty = no students)
      ];

      const dto: GenerateTagihanDto = { bulan: 7, tahun: 2024 };

      await service.generateTagihan(tenantId, dto);

      expect(mockRedisService.acquireLock).toHaveBeenCalledWith(
        `billing-gen:${tenantId}:${tahunAjaranId}`,
        300,
      );
      expect(mockRedisService.releaseLock).toHaveBeenCalledWith(
        `billing-gen:${tenantId}:${tahunAjaranId}`,
      );
    });
  });

  describe('Per-month generation', () => {
    /**
     * Requirement 9.1: Generate tagihan for each active student per class config nominal.
     */
    it('should create tagihan for active students with correct nominal per tingkat', async () => {
      selectResults = [
        [activeTahunAjaran], // getActiveTahunAjaran
        activeStudents, // active students with kelas
      ];
      insertResult = [
        { id: 'tag-1', siswaId: siswaId1, bulan: 9, tahun: 2024, nominal: 250000 },
        { id: 'tag-2', siswaId: siswaId2, bulan: 9, tahun: 2024, nominal: 250000 },
      ];

      const dto: GenerateTagihanDto = { bulan: 9, tahun: 2024 };
      const result = await service.generateTagihan(tenantId, dto);

      expect(result.created).toBe(2);
      expect(result.total_nominal).toBe(500000);
      expect(result.months_processed).toBe(1);
    });

    /**
     * Requirement 10.3: If tagihan already exists, skip (ON CONFLICT DO NOTHING).
     */
    it('should report skipped count when tagihan already exists (idempotent)', async () => {
      selectResults = [[activeTahunAjaran], activeStudents];
      // ON CONFLICT DO NOTHING → only 1 of 2 actually inserted
      insertResult = [{ id: 'tag-1', siswaId: siswaId1, bulan: 9, tahun: 2024, nominal: 250000 }];

      const dto: GenerateTagihanDto = { bulan: 9, tahun: 2024 };
      const result = await service.generateTagihan(tenantId, dto);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.total_nominal).toBe(250000);
    });

    /**
     * When no active students exist, return zero counts.
     */
    it('should return zero counts when no active students', async () => {
      selectResults = [
        [activeTahunAjaran],
        [], // no active students
      ];

      const dto: GenerateTagihanDto = { bulan: 9, tahun: 2024 };
      const result = await service.generateTagihan(tenantId, dto);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.total_nominal).toBe(0);
    });
  });

  describe('Per-tahun_ajaran generation', () => {
    /**
     * Requirement 10.1: Generate for all months in tahun_ajaran.
     * Requirement 10.2: Calculate month count from start/end dates.
     */
    it('should generate tagihan for all months in tahun ajaran range', async () => {
      selectResults = [
        [activeTahunAjaran], // getTahunAjaran (specific ID lookup)
        activeStudents, // active students
      ];
      // 12 months × 2 students = 24 tagihan total
      const allInserted = Array.from({ length: 24 }, (_, i) => ({
        id: `tag-${i}`,
        siswaId: i < 12 ? siswaId1 : siswaId2,
        bulan: (i % 12) + 7 > 12 ? (i % 12) + 7 - 12 : (i % 12) + 7,
        tahun: i % 12 < 6 ? 2024 : 2025,
        nominal: 250000,
      }));
      insertResult = allInserted;

      const dto: GenerateTagihanDto = { tahun_ajaran_id: tahunAjaranId };
      const result = await service.generateTagihan(tenantId, dto);

      expect(result.created).toBe(24);
      expect(result.total_nominal).toBe(24 * 250000);
      expect(result.months_processed).toBe(12); // Jul 2024 — Jun 2025 = 12 months
    });

    /**
     * Requirement 10.3: Skip duplicates when re-running generation.
     */
    it('should skip all when all tagihan already exist for tahun_ajaran', async () => {
      selectResults = [[activeTahunAjaran], activeStudents];
      insertResult = []; // all conflicted

      const dto: GenerateTagihanDto = { tahun_ajaran_id: tahunAjaranId };
      const result = await service.generateTagihan(tenantId, dto);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(24); // 12 months × 2 students
      expect(result.total_nominal).toBe(0);
    });

    /**
     * Requirement 10.4: Return summary with created, skipped, total_nominal.
     */
    it('should return correct summary with mixed created/skipped', async () => {
      selectResults = [[activeTahunAjaran], activeStudents];
      // Only 5 out of 24 actually inserted
      insertResult = Array.from({ length: 5 }, (_, i) => ({
        id: `tag-${i}`,
        siswaId: siswaId1,
        bulan: i + 7,
        tahun: 2024,
        nominal: 250000,
      }));

      const dto: GenerateTagihanDto = { tahun_ajaran_id: tahunAjaranId };
      const result = await service.generateTagihan(tenantId, dto);

      expect(result.created).toBe(5);
      expect(result.skipped).toBe(19);
      expect(result.total_nominal).toBe(5 * 250000);
    });
  });

  describe('Tahun ajaran not found', () => {
    /**
     * Should throw NotFoundException when tahun_ajaran_id doesn't exist.
     */
    it('should throw NotFoundException when tahun_ajaran_id not found', async () => {
      selectResults = [[]]; // getTahunAjaran returns empty

      const dto: GenerateTagihanDto = { tahun_ajaran_id: 'nonexistent' };

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(NotFoundException);
    });

    /**
     * Should throw NotFoundException when no active tahun ajaran in per-month mode.
     */
    it('should throw NotFoundException when no active tahun ajaran for per-month mode', async () => {
      selectResults = [[]]; // getActiveTahunAjaran returns empty

      const dto: GenerateTagihanDto = { bulan: 9, tahun: 2024 };

      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(NotFoundException);
      await expect(service.generateTagihan(tenantId, dto)).rejects.toThrow(
        'Tidak ada tahun ajaran aktif',
      );
    });
  });

  describe('Notification for new tagihan (Requirement 10.5)', () => {
    /**
     * Should send notification to parents when new tagihan are created.
     */
    it('should enqueue notification for parent when tagihan created', async () => {
      selectResults = [
        [activeTahunAjaran],
        activeStudents, // both students have orangTuaId
      ];
      insertResult = [
        { id: 'tag-1', siswaId: siswaId1, bulan: 9, tahun: 2024, nominal: 250000 },
        { id: 'tag-2', siswaId: siswaId2, bulan: 9, tahun: 2024, nominal: 250000 },
      ];

      const dto: GenerateTagihanDto = { bulan: 9, tahun: 2024 };
      await service.generateTagihan(tenantId, dto);

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-new-tagihan-notification',
        expect.objectContaining({
          tenant_id: tenantId,
          orang_tua_id: orangTuaId1,
        }),
      );
    });

    /**
     * Should NOT send notification when no new tagihan created (all skipped).
     */
    it('should not enqueue notification when all tagihan skipped', async () => {
      selectResults = [[activeTahunAjaran], activeStudents];
      insertResult = []; // all skipped (ON CONFLICT DO NOTHING)

      const dto: GenerateTagihanDto = { bulan: 9, tahun: 2024 };
      await service.generateTagihan(tenantId, dto);

      expect(mockNotificationQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('New student tagihan generation (Req 9.5–9.7)', () => {
    /**
     * Requirement 9.5: Auto-generate from bulan berjalan to end of tahun_ajaran.
     * Requirement 9.7: Should NOT create tagihan for months before student joined.
     */
    it('should generate tagihan from current month to end of tahun_ajaran', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // Mock tahun ajaran that ends in June next year
      const endYear = currentMonth > 6 ? currentYear + 1 : currentYear;
      const ta = {
        ...activeTahunAjaran,
        tanggalMulai: `${currentYear}-07-01`,
        tanggalSelesai: `${endYear}-06-30`,
      };

      selectResults = [
        [ta], // getTahunAjaran
        [{ id: kelasId1, tingkat: 2 }], // getKelasWithTingkat
        [{ id: siswaId1, nama: 'Budi Baru', orangTuaId: orangTuaId1 }], // getStudentInfo
      ];

      // Calculate expected months
      const allMonths: any[] = [];
      const m = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(endYear, 5, 1); // June end year
      while (m <= endDate) {
        allMonths.push({
          id: `tag-${allMonths.length}`,
          bulan: m.getMonth() + 1,
          tahun: m.getFullYear(),
        });
        m.setMonth(m.getMonth() + 1);
      }
      insertResult = allMonths;

      const result = await service.generateTagihanForNewStudent(
        tenantId,
        siswaId1,
        kelasId1,
        tahunAjaranId,
      );

      expect(result.created).toBe(allMonths.length);
      expect(result.total_nominal).toBe(allMonths.length * 275000); // tingkat_2 = 275000
    });

    /**
     * Requirement 9.6: Use nominal from class config (tingkat).
     */
    it('should use correct nominal based on student class tingkat', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const ta = {
        ...activeTahunAjaran,
        tanggalMulai: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
        tanggalSelesai: `${currentYear}-${String(currentMonth).padStart(2, '0')}-28`,
      };

      selectResults = [
        [ta],
        [{ id: kelasId1, tingkat: 3 }], // tingkat 3 → 300000
        [{ id: siswaId1, nama: 'Andi', orangTuaId: orangTuaId1 }],
      ];
      insertResult = [{ id: 'tag-1', bulan: currentMonth, tahun: currentYear }];

      const result = await service.generateTagihanForNewStudent(
        tenantId,
        siswaId1,
        kelasId1,
        tahunAjaranId,
      );

      expect(result.created).toBe(1);
      expect(result.total_nominal).toBe(300000);
    });

    /**
     * Should send notification to parent for new student tagihan.
     */
    it('should send notification to parent for new student tagihan', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const ta = {
        ...activeTahunAjaran,
        tanggalMulai: `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`,
        tanggalSelesai: `${currentYear}-${String(currentMonth).padStart(2, '0')}-28`,
      };

      selectResults = [
        [ta],
        [{ id: kelasId1, tingkat: 1 }],
        [{ id: siswaId1, nama: 'Budi', orangTuaId: orangTuaId1 }],
      ];
      insertResult = [{ id: 'tag-new', bulan: currentMonth, tahun: currentYear }];

      await service.generateTagihanForNewStudent(tenantId, siswaId1, kelasId1, tahunAjaranId);

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-new-tagihan-notification',
        expect.objectContaining({
          tenant_id: tenantId,
          orang_tua_id: orangTuaId1,
          siswa_id: siswaId1,
          siswa_nama: 'Budi',
        }),
      );
    });
  });

  describe('getMonthsInRange', () => {
    /**
     * Validates that getMonthsInRange calculates correct month span.
     */
    it('should calculate correct months for Jul 2024 to Jun 2025', () => {
      const months = service.getMonthsInRange('2024-07-01', '2025-06-30');
      expect(months.length).toBe(12);
      expect(months[0]).toEqual({ bulan: 7, tahun: 2024 });
      expect(months[11]).toEqual({ bulan: 6, tahun: 2025 });
    });

    /**
     * Short tahun ajaran range (3 months).
     */
    it('should handle short tahun ajaran range', () => {
      const months = service.getMonthsInRange('2024-10-01', '2024-12-31');
      expect(months.length).toBe(3);
      expect(months[0]).toEqual({ bulan: 10, tahun: 2024 });
      expect(months[2]).toEqual({ bulan: 12, tahun: 2024 });
    });

    /**
     * Single month range.
     */
    it('should handle single month range', () => {
      const months = service.getMonthsInRange('2024-09-01', '2024-09-30');
      expect(months.length).toBe(1);
      expect(months[0]).toEqual({ bulan: 9, tahun: 2024 });
    });
  });
});
