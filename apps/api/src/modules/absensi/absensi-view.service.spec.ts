import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

describe('AbsensiService — View Endpoints (Task 8.6)', () => {
  let service: AbsensiService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const kelasId = '22222222-2222-2222-2222-222222222222';
  const guruId = '33333333-3333-3333-3333-333333333333';
  const tahunAjaranId = '44444444-4444-4444-4444-444444444444';

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

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
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
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AbsensiService>(AbsensiService);
  });

  // ─── getAbsensiByKelasAndTanggal ──────────────────────────────────────

  describe('getAbsensiByKelasAndTanggal', () => {
    it('should throw NotFoundException when kelas does not exist', async () => {
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      await expect(
        service.getAbsensiByKelasAndTanggal(tenantId, kelasId, '2024-10-01', guruId, 'guru'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return attendance data with can_edit=true for kepala_sekolah', async () => {
      const mockKelas = { id: kelasId, nama: '6A', tingkat: 6, tahunAjaranId };

      // Query 1: find kelas
      mockDb.select.mockReturnValueOnce(createChainableMock([mockKelas]));

      // Query 2: get attendance records (no jadwal check for kepala_sekolah)
      const records = [
        { siswa_id: 'siswa-1', siswa_nama: 'Andi', status: 'hadir' },
        { siswa_id: 'siswa-2', siswa_nama: 'Budi', status: 'alpa' },
      ];
      mockDb.select.mockReturnValueOnce(createChainableMock(records));

      const result = await service.getAbsensiByKelasAndTanggal(
        tenantId,
        kelasId,
        '2024-10-01',
        'kepala-id',
        'kepala_sekolah',
      );

      expect(result.kelas_id).toBe(kelasId);
      expect(result.kelas_nama).toBe('6A');
      expect(result.tanggal).toBe('2024-10-01');
      expect(result.can_edit).toBe(true);
      expect(result.records).toEqual(records);
    });

    it('should return can_edit=true for guru assigned to the class via jadwal', async () => {
      const mockKelas = { id: kelasId, nama: '6A', tingkat: 6, tahunAjaranId };

      // Query 1: find kelas
      mockDb.select.mockReturnValueOnce(createChainableMock([mockKelas]));

      // Query 2: check guru jadwal → found
      mockDb.select.mockReturnValueOnce(createChainableMock([{ id: 'jadwal-1' }]));

      // Query 3: get attendance records
      const records = [{ siswa_id: 'siswa-1', siswa_nama: 'Andi', status: 'hadir' }];
      mockDb.select.mockReturnValueOnce(createChainableMock(records));

      const result = await service.getAbsensiByKelasAndTanggal(
        tenantId,
        kelasId,
        '2024-10-01',
        guruId,
        'guru',
      );

      expect(result.can_edit).toBe(true);
      expect(result.records).toEqual(records);
    });

    it('should return can_edit=false for guru NOT assigned to the class', async () => {
      const mockKelas = { id: kelasId, nama: '6A', tingkat: 6, tahunAjaranId };

      // Query 1: find kelas
      mockDb.select.mockReturnValueOnce(createChainableMock([mockKelas]));

      // Query 2: check guru jadwal → NOT found
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      // Query 3: get attendance records
      const records = [{ siswa_id: 'siswa-1', siswa_nama: 'Andi', status: 'sakit' }];
      mockDb.select.mockReturnValueOnce(createChainableMock(records));

      const result = await service.getAbsensiByKelasAndTanggal(
        tenantId,
        kelasId,
        '2024-10-01',
        guruId,
        'guru',
      );

      expect(result.can_edit).toBe(false);
      expect(result.records).toEqual(records);
    });

    it('should return empty records when no attendance exists for that date', async () => {
      const mockKelas = { id: kelasId, nama: '6A', tingkat: 6, tahunAjaranId };

      // Query 1: find kelas
      mockDb.select.mockReturnValueOnce(createChainableMock([mockKelas]));

      // Query 2: check guru jadwal → found
      mockDb.select.mockReturnValueOnce(createChainableMock([{ id: 'jadwal-1' }]));

      // Query 3: get attendance records → empty
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getAbsensiByKelasAndTanggal(
        tenantId,
        kelasId,
        '2024-10-01',
        guruId,
        'guru',
      );

      expect(result.records).toEqual([]);
      expect(result.kelas_nama).toBe('6A');
    });
  });

  // ─── getDashboard ──────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should return empty result when no active tahun_ajaran exists', async () => {
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getDashboard(tenantId);

      expect(result.ringkasan_per_kelas).toEqual([]);
      expect(result.perhatian_khusus).toEqual([]);
      expect(result.tanggal).toBeDefined();
    });

    it('should return attendance summary per class for today', async () => {
      // Query 1: active tahun_ajaran
      mockDb.select.mockReturnValueOnce(createChainableMock([{ id: tahunAjaranId }]));

      // Query 2: all classes in active tahun_ajaran
      mockDb.select.mockReturnValueOnce(createChainableMock([{ id: kelasId, nama: '6A' }]));

      // Query 3: count total students for class
      mockDb.select.mockReturnValueOnce(createChainableMock([{ count: 30 }]));

      // Query 4: count attendance by status for class
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { status: 'hadir', count: 25 },
          { status: 'izin', count: 2 },
          { status: 'sakit', count: 1 },
          { status: 'alpa', count: 2 },
        ]),
      );

      // Config: threshold_alpa
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'threshold_alpa',
        value: { value: 10 },
      });

      // Query 5: perhatian khusus
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { siswa_id: 'siswa-x', siswa_nama: 'Rudi', kelas_nama: '6A', total_alpa: 12 },
        ]),
      );

      const result = await service.getDashboard(tenantId);

      expect(result.ringkasan_per_kelas).toHaveLength(1);
      expect(result.ringkasan_per_kelas[0]).toEqual({
        kelas_id: kelasId,
        kelas_nama: '6A',
        total_siswa: 30,
        hadir: 25,
        izin: 2,
        sakit: 1,
        alpa: 2,
      });
      expect(result.perhatian_khusus).toHaveLength(1);
      expect(result.perhatian_khusus[0]).toEqual({
        siswa_id: 'siswa-x',
        siswa_nama: 'Rudi',
        kelas_nama: '6A',
        total_alpa: 12,
      });
    });

    it('should handle threshold_alpa config when value is plain number', async () => {
      // Query 1: active tahun_ajaran
      mockDb.select.mockReturnValueOnce(createChainableMock([{ id: tahunAjaranId }]));

      // Query 2: no classes
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      // Config: returns plain number
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'threshold_alpa',
        value: 15,
      });

      // Query 3: perhatian khusus
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getDashboard(tenantId);

      expect(mockKonfigurasiService.getConfigByKey).toHaveBeenCalledWith(
        tenantId,
        'threshold_alpa',
      );
      expect(result.perhatian_khusus).toEqual([]);
    });

    it('should handle multiple classes in the dashboard', async () => {
      // Query 1: active tahun_ajaran
      mockDb.select.mockReturnValueOnce(createChainableMock([{ id: tahunAjaranId }]));

      // Query 2: two classes
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { id: 'kelas-1', nama: '1A' },
          { id: 'kelas-2', nama: '1B' },
        ]),
      );

      // Promise.all interleaving with thenables:
      // Class 1 student count, Class 2 student count, Class 1 attendance, Class 2 attendance
      mockDb.select.mockReturnValueOnce(createChainableMock([{ count: 20 }])); // kelas-1 students
      mockDb.select.mockReturnValueOnce(createChainableMock([{ count: 25 }])); // kelas-2 students
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { status: 'hadir', count: 18 },
          { status: 'alpa', count: 2 },
        ]),
      ); // kelas-1 attendance
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { status: 'hadir', count: 22 },
          { status: 'izin', count: 1 },
          { status: 'sakit', count: 2 },
        ]),
      ); // kelas-2 attendance

      // Config: threshold
      mockKonfigurasiService.getConfigByKey.mockResolvedValue({
        key: 'threshold_alpa',
        value: { value: 10 },
      });

      // Perhatian khusus: none
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getDashboard(tenantId);

      expect(result.ringkasan_per_kelas).toHaveLength(2);
      expect(result.ringkasan_per_kelas[0]).toEqual({
        kelas_id: 'kelas-1',
        kelas_nama: '1A',
        total_siswa: 20,
        hadir: 18,
        izin: 0,
        sakit: 0,
        alpa: 2,
      });
      expect(result.ringkasan_per_kelas[1]).toEqual({
        kelas_id: 'kelas-2',
        kelas_nama: '1B',
        total_siswa: 25,
        hadir: 22,
        izin: 1,
        sakit: 2,
        alpa: 0,
      });
      expect(result.perhatian_khusus).toEqual([]);
    });
  });
});
