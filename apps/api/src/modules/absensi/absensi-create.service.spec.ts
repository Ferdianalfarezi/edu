import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { CreateAbsensiDto } from './dto';

/**
 * AbsensiService Unit Tests — Create Attendance (POST /absensi/kelas/:kelasId)
 * and Get Today's Classes (GET /absensi/kelas-hari-ini)
 *
 * Requirements: 1.1–1.14
 */
describe('AbsensiService - createAbsensi & getKelasHariIni', () => {
  let service: AbsensiService;
  let mockNotificationQueue: { add: jest.Mock };
  let mockJadwalService: { isGuruPenggantiForClassOnDate: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '22222222-2222-2222-2222-222222222222';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const siswaId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const siswaId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const siswaId3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const activeStudents = [
    { id: siswaId1, nama: 'Budi' },
    { id: siswaId2, nama: 'Sari' },
    { id: siswaId3, nama: 'Andi' },
  ];

  const kelasData = { id: kelasId, nama: '6A' };

  // Use a known Monday date for predictable testing
  const tanggal = '2024-10-14'; // This is a Monday (senin)

  // Track what the db receives
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
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    insertResult = [];
    mockDb = createMockDb();
    mockNotificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockJadwalService = {
      isGuruPenggantiForClassOnDate: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbsensiService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: KonfigurasiService, useValue: { getConfigByKey: jest.fn() } },
        { provide: JadwalService, useValue: mockJadwalService },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockNotificationQueue },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<AbsensiService>(AbsensiService);
  });

  describe('createAbsensi', () => {
    const validDto: CreateAbsensiDto = {
      tanggal,
      records: [
        { siswa_id: siswaId1, status: 'hadir' },
        { siswa_id: siswaId2, status: 'izin' },
        { siswa_id: siswaId3, status: 'sakit' },
      ],
    };

    /**
     * Requirement 1.7: Only authorized guru can input attendance.
     * Guru must have jadwal for this class on this day OR be guru_pengganti.
     */
    it('should throw ForbiddenException when guru has no jadwal and is not pengganti', async () => {
      // hasActiveJadwalForClass → no result
      selectResults = [[]];
      mockJadwalService.isGuruPenggantiForClassOnDate.mockResolvedValue(false);

      await expect(service.createAbsensi(tenantId, guruId, kelasId, validDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    /**
     * Requirement 1.7: Guru with valid jadwal IS authorized.
     */
    it('should allow guru with active jadwal to create attendance', async () => {
      selectResults = [
        [{ id: 'jadwal-1' }], // hasActiveJadwalForClass → found
        [kelasData], // kelas validation
        activeStudents, // active students
        [], // holiday check (no holiday)
      ];
      insertResult = [
        { id: 'abs-1', siswaId: siswaId1, status: 'hadir' },
        { id: 'abs-2', siswaId: siswaId2, status: 'izin' },
        { id: 'abs-3', siswaId: siswaId3, status: 'sakit' },
      ];

      const result = await service.createAbsensi(tenantId, guruId, kelasId, validDto);

      expect(result.message).toBe('Absensi berhasil disimpan');
      expect(result.inserted).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.kelas).toBe('6A');
    });

    /**
     * Requirement 1.7: Guru_pengganti IS authorized.
     */
    it('should allow guru_pengganti to create attendance', async () => {
      // No jadwal found but is pengganti
      selectResults = [
        [], // hasActiveJadwalForClass → not found
        [kelasData], // kelas validation
        activeStudents, // active students
        [], // no holiday
      ];
      mockJadwalService.isGuruPenggantiForClassOnDate.mockResolvedValue(true);
      insertResult = [
        { id: 'abs-1', siswaId: siswaId1, status: 'hadir' },
        { id: 'abs-2', siswaId: siswaId2, status: 'izin' },
        { id: 'abs-3', siswaId: siswaId3, status: 'sakit' },
      ];

      const result = await service.createAbsensi(tenantId, guruId, kelasId, validDto);

      expect(result.message).toBe('Absensi berhasil disimpan');
      expect(mockJadwalService.isGuruPenggantiForClassOnDate).toHaveBeenCalledWith(
        tenantId,
        guruId,
        kelasId,
        tanggal,
      );
    });

    /**
     * Requirement 1.4, 1.5: All students must have a status.
     * If any student is missing, show their names in error.
     */
    it('should throw BadRequestException when some students are missing from records', async () => {
      const incompleteDto: CreateAbsensiDto = {
        tanggal,
        records: [
          { siswa_id: siswaId1, status: 'hadir' },
          // Missing siswaId2 (Sari) and siswaId3 (Andi)
        ],
      };

      selectResults = [
        [{ id: 'jadwal-1' }], // authorized
        [kelasData], // kelas found
        activeStudents, // 3 active students
      ];

      await expect(service.createAbsensi(tenantId, guruId, kelasId, incompleteDto)).rejects.toThrow(
        BadRequestException,
      );

      // Reset for second assertion
      selectCallIndex = 0;
      selectResults = [[{ id: 'jadwal-1' }], [kelasData], activeStudents];

      try {
        await service.createAbsensi(tenantId, guruId, kelasId, incompleteDto);
      } catch (err: any) {
        expect(err.message).toContain('Sari');
        expect(err.message).toContain('Andi');
      }
    });

    /**
     * Requirement 1.4: Invalid student IDs are rejected.
     */
    it('should throw BadRequestException when records contain invalid siswa_id', async () => {
      const invalidDto: CreateAbsensiDto = {
        tanggal,
        records: [
          { siswa_id: siswaId1, status: 'hadir' },
          { siswa_id: siswaId2, status: 'izin' },
          { siswa_id: siswaId3, status: 'sakit' },
          { siswa_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', status: 'alpa' },
        ],
      };

      selectResults = [
        [{ id: 'jadwal-1' }],
        [kelasData],
        activeStudents, // only 3 active students
      ];

      await expect(service.createAbsensi(tenantId, guruId, kelasId, invalidDto)).rejects.toThrow(
        'Beberapa siswa_id tidak termasuk siswa aktif di kelas ini',
      );
    });

    /**
     * Requirement 1.8: ON CONFLICT DO NOTHING — first guru creates record,
     * subsequent attempts are skipped.
     */
    it('should report skipped records when attendance already exists (idempotent)', async () => {
      selectResults = [
        [{ id: 'jadwal-1' }],
        [kelasData],
        activeStudents,
        [], // no holiday
      ];
      // ON CONFLICT DO NOTHING → 0 rows inserted (all already exist)
      insertResult = [];

      const result = await service.createAbsensi(tenantId, guruId, kelasId, validDto);

      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(3);
      expect(result.message).toBe(
        'Absensi untuk kelas ini pada tanggal tersebut sudah ada (read-only)',
      );
    });

    /**
     * Requirement 1.13: Holiday warning — allow but warn.
     */
    it('should include holiday warning when date is a hari libur', async () => {
      selectResults = [
        [{ id: 'jadwal-1' }],
        [kelasData],
        activeStudents,
        [{ keterangan: 'Hari Kemerdekaan' }], // holiday found!
      ];
      insertResult = [{ id: 'abs-1' }, { id: 'abs-2' }, { id: 'abs-3' }];

      const result = await service.createAbsensi(tenantId, guruId, kelasId, validDto);

      expect(result.warning).toBe('Hari ini ditandai sebagai hari libur: Hari Kemerdekaan');
      expect(result.message).toBe('Absensi berhasil disimpan');
    });

    /**
     * Requirement 1.6: ONE batch notification job per class with 0-5s jitter.
     */
    it('should emit exactly ONE notification job per class with delay 0-5000ms', async () => {
      selectResults = [[{ id: 'jadwal-1' }], [kelasData], activeStudents, []];
      insertResult = [{ id: 'abs-1' }, { id: 'abs-2' }, { id: 'abs-3' }];

      await service.createAbsensi(tenantId, guruId, kelasId, validDto);

      expect(mockNotificationQueue.add).toHaveBeenCalledTimes(1);
      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-batch-attendance-notification',
        expect.objectContaining({
          tenant_id: tenantId,
          kelas_id: kelasId,
          kelas_nama: '6A',
          tanggal,
          waktu_input: expect.any(String),
          records: expect.arrayContaining([
            { siswa_id: siswaId1, status: 'hadir' },
            { siswa_id: siswaId2, status: 'izin' },
            { siswa_id: siswaId3, status: 'sakit' },
          ]),
        }),
        expect.objectContaining({
          delay: expect.any(Number),
        }),
      );

      // Verify jitter is 0-5000ms
      const addCall = mockNotificationQueue.add.mock.calls[0];
      const delay = addCall[2].delay;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(5000);
    });

    /**
     * Requirement 1.3: Status must be one of hadir, izin, sakit, alpa.
     */
    it('should accept all valid status values (hadir, izin, sakit, alpa)', async () => {
      const allStatusDto: CreateAbsensiDto = {
        tanggal,
        records: [
          { siswa_id: siswaId1, status: 'hadir' },
          { siswa_id: siswaId2, status: 'alpa' },
          { siswa_id: siswaId3, status: 'izin' },
        ],
      };

      selectResults = [[{ id: 'jadwal-1' }], [kelasData], activeStudents, []];
      insertResult = [{ id: '1' }, { id: '2' }, { id: '3' }];

      const result = await service.createAbsensi(tenantId, guruId, kelasId, allStatusDto);
      expect(result.inserted).toBe(3);
    });

    /**
     * Edge case: class with no active students.
     */
    it('should throw BadRequestException when class has no active students', async () => {
      selectResults = [
        [{ id: 'jadwal-1' }], // authorized
        [kelasData], // class found
        [], // no active students
      ];

      await expect(service.createAbsensi(tenantId, guruId, kelasId, validDto)).rejects.toThrow(
        'Tidak ada siswa aktif di kelas ini',
      );
    });

    /**
     * Edge case: class not found.
     */
    it('should throw BadRequestException when class does not exist', async () => {
      selectResults = [
        [{ id: 'jadwal-1' }], // authorized
        [], // kelas not found
      ];

      await expect(service.createAbsensi(tenantId, guruId, kelasId, validDto)).rejects.toThrow(
        'Kelas tidak ditemukan',
      );
    });

    /**
     * Requirement 1.13: Holiday with null keterangan shows default message.
     */
    it('should show default holiday message when keterangan is null', async () => {
      selectResults = [[{ id: 'jadwal-1' }], [kelasData], activeStudents, [{ keterangan: null }]];
      insertResult = [{ id: '1' }, { id: '2' }, { id: '3' }];

      const result = await service.createAbsensi(tenantId, guruId, kelasId, validDto);

      expect(result.warning).toBe('Hari ini ditandai sebagai hari libur: Hari Libur');
    });
  });

  describe('getKelasHariIni', () => {
    /**
     * Requirement 1.12: When no classes scheduled, show message.
     */
    it('should return empty kelas with message when guru has no schedule today', async () => {
      selectResults = [
        [], // no jadwal
        [], // no pengganti
      ];

      const result = await service.getKelasHariIni(tenantId, guruId);

      expect(result.kelas).toEqual([]);
      expect(result.tanggal).toBeDefined();
      // On any day (including Sunday), should show appropriate message
      if (result.kelas.length === 0) {
        expect(result.message).toBe('Tidak ada kelas terjadwal untuk hari ini');
      }
    });

    /**
     * Requirement 1.1: Returns scheduled classes with details.
     */
    it('should return scheduled classes when guru has jadwal today', async () => {
      const scheduledClasses = [
        { kelasId: kelasId, kelasNama: '6A', jamMulai: '08:00', jamSelesai: '09:30' },
      ];

      selectResults = [
        scheduledClasses, // jadwal
        [], // no pengganti
      ];

      const result = await service.getKelasHariIni(tenantId, guruId);

      expect(result.tanggal).toBeDefined();
      // If today is not Sunday, we expect classes
      if (result.hari !== 'minggu') {
        expect(result.kelas).toHaveLength(1);
        expect(result.kelas[0].kelasId).toBe(kelasId);
        expect(result.kelas[0].kelasNama).toBe('6A');
      }
    });

    /**
     * Returns pengganti classes merged with regular jadwal.
     */
    it('should include pengganti classes in the result', async () => {
      const kelasId2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      selectResults = [
        [{ kelasId: kelasId, kelasNama: '6A', jamMulai: '08:00', jamSelesai: '09:30' }],
        [{ kelasId: kelasId2, kelasNama: '5B' }], // pengganti class
      ];

      const result = await service.getKelasHariIni(tenantId, guruId);

      if (result.hari !== 'minggu') {
        expect(result.kelas.length).toBe(2);
      }
    });
  });
});
