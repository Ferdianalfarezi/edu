import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

describe('AbsensiService — Rekap Absensi (Task 8.8)', () => {
  let service: AbsensiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const kelasId = '22222222-2222-2222-2222-222222222222';

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
  let mockKonfigurasiService: any;
  let selectCallIndex: number;

  beforeEach(async () => {
    selectCallIndex = 0;
    const selectResults: any[] = [];

    mockDb = {
      select: jest.fn().mockImplementation(() => {
        const idx = selectCallIndex++;
        if (idx < selectResults.length) {
          return selectResults[idx];
        }
        return createChainableMock([]);
      }),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockKonfigurasiService = {
      getConfigByKey: jest.fn(),
    };

    const mockJadwalService = {
      isGuruPenggantiForClassOnDate: jest.fn(),
    };

    const mockNotificationQueue = {
      add: jest.fn(),
    };

    const mockExportQueue = {
      add: jest.fn(),
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

  // ─── getRekapAbsensi ──────────────────────────────────────────────────

  describe('getRekapAbsensi', () => {
    it('should throw NotFoundException when kelas does not exist', async () => {
      setupSelectMocks(
        [], // kelas query returns empty
      );

      await expect(
        service.getRekapAbsensi(tenantId, {
          kelas_id: kelasId,
          bulan: 10,
          tahun: 2024,
          periode: 'bulanan',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty array when no active students exist in the class', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [], // no active students
      );

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toEqual([]);
      expect(result.kelas_id).toBe(kelasId);
      expect(result.kelas_nama).toBe('6A');
    });

    it('should calculate per-student counts correctly for bulanan period', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [
          { id: 'siswa-1', nama: 'Andi' },
          { id: 'siswa-2', nama: 'Budi' },
        ], // active students
        [
          // attendance records
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'izin' },
          { siswaId: 'siswa-1', status: 'sakit' },
          { siswaId: 'siswa-1', status: 'alpa' },
          { siswaId: 'siswa-2', status: 'hadir' },
          { siswaId: 'siswa-2', status: 'hadir' },
          { siswaId: 'siswa-2', status: 'hadir' },
          { siswaId: 'siswa-2', status: 'alpa' },
          { siswaId: 'siswa-2', status: 'alpa' },
        ],
        // holidays query (for auto-calc) - no holidays
        [],
      );

      // No manual override for hari_efektif
      mockKonfigurasiService.getConfigByKey.mockRejectedValue(new NotFoundException('Not found'));

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toHaveLength(2);

      const andi = result.data.find((r) => r.siswa_id === 'siswa-1');
      expect(andi).toBeDefined();
      expect(andi!.hadir).toBe(2);
      expect(andi!.izin).toBe(1);
      expect(andi!.sakit).toBe(1);
      expect(andi!.alpa).toBe(1);

      const budi = result.data.find((r) => r.siswa_id === 'siswa-2');
      expect(budi).toBeDefined();
      expect(budi!.hadir).toBe(3);
      expect(budi!.izin).toBe(0);
      expect(budi!.sakit).toBe(0);
      expect(budi!.alpa).toBe(2);
    });

    it('should use manual hari_efektif override when available', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [{ id: 'siswa-1', nama: 'Andi' }], // active students
        [
          // 20 hadir records
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
        ],
      );

      // Manual override: hari_efektif = 25
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'hari_efektif_manual_10_2024',
        value: { value: 25 },
      });

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toHaveLength(1);
      expect(result.total_hari_efektif).toBe(25);
      // persentase = (20 / 25) * 100 = 80.0
      expect(result.data[0].persentase_kehadiran).toBe(80.0);
    });

    it('should return null for persentase_kehadiran when hari_efektif cannot be determined', async () => {
      // Build holidays that cover ALL weekdays in October 2024 → 0 effective days → null
      const weekdayHolidays: { tanggal: string }[] = [];
      for (let d = 1; d <= 31; d++) {
        const dateStr = `2024-10-${String(d).padStart(2, '0')}`;
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 6) {
          weekdayHolidays.push({ tanggal: dateStr });
        }
      }

      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [{ id: 'siswa-1', nama: 'Andi' }], // active students
        [{ siswaId: 'siswa-1', status: 'hadir' }], // attendance records
        weekdayHolidays, // all weekdays are holidays → 0 effective days
      );

      // No manual override
      mockKonfigurasiService.getConfigByKey.mockRejectedValue(new NotFoundException('Not found'));

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toHaveLength(1);
      expect(result.total_hari_efektif).toBeNull();
      expect(result.data[0].persentase_kehadiran).toBeNull();
    });

    it('should calculate persentase_kehadiran rounded to 1 decimal place', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [{ id: 'siswa-1', nama: 'Andi' }], // active students
        [
          // 7 hadir out of 22 effective days → 7/22 * 100 = 31.818... → 31.8
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
        ],
      );

      // Manual override: 22 hari efektif
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'hari_efektif_manual_10_2024',
        value: { value: 22 },
      });

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].hadir).toBe(7);
      expect(result.total_hari_efektif).toBe(22);
      // 7/22 * 100 = 31.818... → rounded to 1 decimal = 31.8
      expect(result.data[0].persentase_kehadiran).toBe(31.8);
    });

    it('should handle semester period by summing 6 months', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [{ id: 'siswa-1', nama: 'Andi' }], // active students
        [
          // attendance over semester
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'izin' },
          { siswaId: 'siswa-1', status: 'alpa' },
        ],
        // holidays query for the full semester period
        [],
      );

      // Manual override for each month (the service calls getConfigByKey for each of the 6 months)
      // Months 7,8,9,10,11,12 in 2024
      mockKonfigurasiService.getConfigByKey
        .mockResolvedValueOnce({ key: 'hari_efektif_manual_7_2024', value: { value: 22 } })
        .mockResolvedValueOnce({ key: 'hari_efektif_manual_8_2024', value: { value: 22 } })
        .mockResolvedValueOnce({ key: 'hari_efektif_manual_9_2024', value: { value: 20 } })
        .mockResolvedValueOnce({ key: 'hari_efektif_manual_10_2024', value: { value: 22 } })
        .mockResolvedValueOnce({ key: 'hari_efektif_manual_11_2024', value: { value: 21 } })
        .mockResolvedValueOnce({ key: 'hari_efektif_manual_12_2024', value: { value: 18 } });

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 7,
        tahun: 2024,
        periode: 'semester',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].hadir).toBe(3);
      expect(result.data[0].izin).toBe(1);
      expect(result.data[0].alpa).toBe(1);
      // total hari efektif = 22+22+20+22+21+18 = 125
      expect(result.total_hari_efektif).toBe(125);
      // persentase = (3 / 125) * 100 = 2.4
      expect(result.data[0].persentase_kehadiran).toBe(2.4);
    });

    it('should auto-calculate hari_efektif from weekdays minus holidays when no manual override', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [{ id: 'siswa-1', nama: 'Andi' }], // active students
        [
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
          { siswaId: 'siswa-1', status: 'hadir' },
        ],
        // holidays: 2 holidays on weekdays in October 2024
        [
          { tanggal: '2024-10-01' }, // Tuesday (weekday)
          { tanggal: '2024-10-28' }, // Monday (weekday)
        ],
      );

      // No manual override
      mockKonfigurasiService.getConfigByKey.mockRejectedValue(new NotFoundException('Not found'));

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toHaveLength(1);
      // October 2024: 31 days
      // Weekdays (Mon-Sat): Oct has 4 Sundays (6, 13, 20, 27) → 31 - 4 = 27 weekdays
      // Minus 2 holidays on weekdays = 25 effective days
      // Actually: let's compute properly
      // Oct 2024: Sun=6,13,20,27 → 4 Sundays → 27 weekdays (Mon-Sat)
      // 2 holidays on weekdays → 27-2 = 25
      expect(result.total_hari_efektif).toBe(25);
      // persentase = (5/25) * 100 = 20.0
      expect(result.data[0].persentase_kehadiran).toBe(20.0);
    });

    it('should return zero counts for students with no attendance records', async () => {
      setupSelectMocks(
        [{ id: kelasId, nama: '6A' }], // kelas exists
        [
          { id: 'siswa-1', nama: 'Andi' },
          { id: 'siswa-2', nama: 'Budi' },
        ], // active students
        [
          // only siswa-1 has records
          { siswaId: 'siswa-1', status: 'hadir' },
        ],
      );

      // Manual override
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'hari_efektif_manual_10_2024',
        value: { value: 20 },
      });

      const result = await service.getRekapAbsensi(tenantId, {
        kelas_id: kelasId,
        bulan: 10,
        tahun: 2024,
        periode: 'bulanan',
      });

      expect(result.data).toHaveLength(2);

      const budi = result.data.find((r) => r.siswa_id === 'siswa-2');
      expect(budi).toBeDefined();
      expect(budi!.hadir).toBe(0);
      expect(budi!.izin).toBe(0);
      expect(budi!.sakit).toBe(0);
      expect(budi!.alpa).toBe(0);
      expect(budi!.persentase_kehadiran).toBe(0);
    });
  });

  // ─── calculateHariEfektif (unit) ──────────────────────────────────────

  describe('calculateHariEfektif', () => {
    it('should prefer manual override over auto-calculation', async () => {
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'hari_efektif_manual_3_2024',
        value: { value: 18 },
      });

      const result = await service.calculateHariEfektif(tenantId, 3, 2024, 'bulanan');
      expect(result).toBe(18);
      // Should NOT query holidays because manual override exists
    });

    it('should return null for semester when all months return null', async () => {
      // No manual override for any month, and we need the DB to return enough holidays
      // to make all months null. Easier to just reject all config calls and
      // make the holiday query return all days as holidays (unrealistic but tests the logic).
      mockKonfigurasiService.getConfigByKey.mockRejectedValue(new NotFoundException('Not found'));

      // For semester, the service will query holidays for each month.
      // We'll make each month's holidays exceed weekdays.
      // The service queries db.select once per month for holidays.
      setupSelectMocks(
        // Month 1 holidays (all 31 days as holidays)
        Array.from({ length: 31 }, (_, i) => ({
          tanggal: `2024-01-${String(i + 1).padStart(2, '0')}`,
        })),
        // Month 2 holidays
        Array.from({ length: 29 }, (_, i) => ({
          tanggal: `2024-02-${String(i + 1).padStart(2, '0')}`,
        })),
        // Month 3 holidays
        Array.from({ length: 31 }, (_, i) => ({
          tanggal: `2024-03-${String(i + 1).padStart(2, '0')}`,
        })),
        // Month 4 holidays
        Array.from({ length: 30 }, (_, i) => ({
          tanggal: `2024-04-${String(i + 1).padStart(2, '0')}`,
        })),
        // Month 5 holidays
        Array.from({ length: 31 }, (_, i) => ({
          tanggal: `2024-05-${String(i + 1).padStart(2, '0')}`,
        })),
        // Month 6 holidays
        Array.from({ length: 30 }, (_, i) => ({
          tanggal: `2024-06-${String(i + 1).padStart(2, '0')}`,
        })),
      );

      const result = await service.calculateHariEfektif(tenantId, 1, 2024, 'semester');
      expect(result).toBeNull();
    });
  });
});
