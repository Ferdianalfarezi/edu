import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { AbsensiService } from './absensi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { JadwalService } from '@/modules/jadwal/jadwal.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

describe('AbsensiService — getAbsensiAnak (Task 8.11)', () => {
  let service: AbsensiService;

  const parentUserId = 'parent-1111-1111-1111-111111111111';
  const siswaId = 'siswa-2222-2222-2222-222222222222';
  const otherParentId = 'other-3333-3333-3333-333333333333';

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

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    const mockKonfigurasiService = {
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

  describe('getAbsensiAnak', () => {
    it('should throw NotFoundException when siswa does not exist', async () => {
      // Query 1: find siswa → empty
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      await expect(service.getAbsensiAnak(parentUserId, siswaId, 10, 2024)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when siswa belongs to another parent', async () => {
      // Query 1: find siswa → belongs to otherParentId
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId, nama: 'Andi', orangTuaId: otherParentId }]),
      );

      await expect(service.getAbsensiAnak(parentUserId, siswaId, 10, 2024)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return attendance calendar view with summary for the requested month', async () => {
      // Query 1: find siswa → belongs to parentUserId
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId, nama: 'Andi', orangTuaId: parentUserId }]),
      );

      // Query 2: get attendance records for October 2024
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { tanggal: '2024-10-01', status: 'hadir' },
          { tanggal: '2024-10-02', status: 'hadir' },
          { tanggal: '2024-10-03', status: 'sakit' },
          { tanggal: '2024-10-04', status: 'izin' },
          { tanggal: '2024-10-07', status: 'hadir' },
          { tanggal: '2024-10-08', status: 'alpa' },
        ]),
      );

      const result = await service.getAbsensiAnak(parentUserId, siswaId, 10, 2024);

      expect(result.siswa_id).toBe(siswaId);
      expect(result.siswa_nama).toBe('Andi');
      expect(result.bulan).toBe(10);
      expect(result.tahun).toBe(2024);
      expect(result.ringkasan).toEqual({
        hadir: 3,
        izin: 1,
        sakit: 1,
        alpa: 1,
      });
      expect(result.hari).toHaveLength(6);
      expect(result.hari[0]).toEqual({ tanggal: '2024-10-01', status: 'hadir' });
      expect(result.hari[5]).toEqual({ tanggal: '2024-10-08', status: 'alpa' });
    });

    it('should default to current month/year when bulan and tahun are not provided', async () => {
      const now = new Date();
      const expectedBulan = now.getMonth() + 1;
      const expectedTahun = now.getFullYear();

      // Query 1: find siswa
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId, nama: 'Budi', orangTuaId: parentUserId }]),
      );

      // Query 2: get attendance records → empty (no records this month)
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getAbsensiAnak(parentUserId, siswaId);

      expect(result.bulan).toBe(expectedBulan);
      expect(result.tahun).toBe(expectedTahun);
      expect(result.ringkasan).toEqual({ hadir: 0, izin: 0, sakit: 0, alpa: 0 });
      expect(result.hari).toEqual([]);
    });

    it('should return empty hari and zero totals when no attendance data exists', async () => {
      // Query 1: find siswa
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId, nama: 'Citra', orangTuaId: parentUserId }]),
      );

      // Query 2: no records for April 2024
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getAbsensiAnak(parentUserId, siswaId, 4, 2024);

      expect(result.siswa_id).toBe(siswaId);
      expect(result.siswa_nama).toBe('Citra');
      expect(result.bulan).toBe(4);
      expect(result.tahun).toBe(2024);
      expect(result.ringkasan).toEqual({ hadir: 0, izin: 0, sakit: 0, alpa: 0 });
      expect(result.hari).toEqual([]);
    });
  });
});
