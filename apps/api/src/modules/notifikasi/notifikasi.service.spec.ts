import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { NotifikasiService } from './notifikasi.service';
import { DrizzleService } from '@/drizzle/drizzle.service';

describe('NotifikasiService — Preferensi API (Task 10.5)', () => {
  let service: NotifikasiService;

  const parentUserId = 'parent-1111-1111-1111-111111111111';
  const siswaId1 = 'siswa-2222-2222-2222-222222222222';
  const siswaId2 = 'siswa-3333-3333-3333-333333333333';
  const otherParentId = 'other-4444-4444-4444-444444444444';

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
   * Creates a chainable mock for insert operations with onConflictDoUpdate and returning.
   */
  const createInsertMock = (result: any[]) => {
    const chain: any = {};
    chain.values = jest.fn().mockReturnValue(chain);
    chain.onConflictDoUpdate = jest.fn().mockReturnValue(chain);
    chain.returning = jest.fn().mockReturnValue(chain);
    chain.then = (resolve: any) => resolve(result);
    chain[Symbol.toStringTag] = 'Promise';
    return chain;
  };

  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifikasiService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<NotifikasiService>(NotifikasiService);
  });

  describe('getPreferensi', () => {
    it('should return empty preferensi array when parent has no active children', async () => {
      // Query 1: get children → empty
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getPreferensi(parentUserId);

      expect(result.preferensi).toEqual([]);
    });

    it('should return default preferences (kehadiran OFF, ketidakhadiran ON) for children without records', async () => {
      // Query 1: get children
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { id: siswaId1, nama: 'Andi' },
          { id: siswaId2, nama: 'Budi' },
        ]),
      );

      // Query 2: get existing preferences → none
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getPreferensi(parentUserId);

      expect(result.preferensi).toHaveLength(2);
      expect(result.preferensi[0]).toEqual({
        anak_id: siswaId1,
        anak_nama: 'Andi',
        kehadiran_enabled: false,
        ketidakhadiran_enabled: true,
      });
      expect(result.preferensi[1]).toEqual({
        anak_id: siswaId2,
        anak_nama: 'Budi',
        kehadiran_enabled: false,
        ketidakhadiran_enabled: true,
      });
    });

    it('should merge existing preference records with defaults for other children', async () => {
      // Query 1: get children
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          { id: siswaId1, nama: 'Andi' },
          { id: siswaId2, nama: 'Budi' },
        ]),
      );

      // Query 2: get existing preferences → only siswaId1 has a record
      mockDb.select.mockReturnValueOnce(
        createChainableMock([
          {
            id: 'pref-1',
            userId: parentUserId,
            siswaId: siswaId1,
            kehadiranEnabled: true,
            ketidakhadiranEnabled: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      );

      const result = await service.getPreferensi(parentUserId);

      expect(result.preferensi).toHaveLength(2);
      // siswaId1 has custom preferences
      expect(result.preferensi[0]).toEqual({
        anak_id: siswaId1,
        anak_nama: 'Andi',
        kehadiran_enabled: true,
        ketidakhadiran_enabled: false,
      });
      // siswaId2 gets defaults
      expect(result.preferensi[1]).toEqual({
        anak_id: siswaId2,
        anak_nama: 'Budi',
        kehadiran_enabled: false,
        ketidakhadiran_enabled: true,
      });
    });
  });

  describe('updatePreferensi', () => {
    it('should throw ForbiddenException when child does not exist or is inactive', async () => {
      // Query 1: find siswa → empty
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      await expect(
        service.updatePreferensi(parentUserId, {
          anak_id: siswaId1,
          kehadiran_enabled: true,
          ketidakhadiran_enabled: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when child belongs to another parent', async () => {
      // Query 1: find siswa → belongs to otherParentId
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId1, orangTuaId: otherParentId }]),
      );

      await expect(
        service.updatePreferensi(parentUserId, {
          anak_id: siswaId1,
          kehadiran_enabled: true,
          ketidakhadiran_enabled: true,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should upsert preference and return updated values', async () => {
      const now = new Date();

      // Query 1: find siswa → belongs to parentUserId
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId1, orangTuaId: parentUserId }]),
      );

      // Insert/upsert → returns the upserted record
      const insertMock = createInsertMock([
        {
          id: 'pref-new-1',
          userId: parentUserId,
          siswaId: siswaId1,
          kehadiranEnabled: true,
          ketidakhadiranEnabled: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      mockDb.insert.mockReturnValueOnce(insertMock);

      const result = await service.updatePreferensi(parentUserId, {
        anak_id: siswaId1,
        kehadiran_enabled: true,
        ketidakhadiran_enabled: false,
      });

      expect(result).toEqual({
        anak_id: siswaId1,
        kehadiran_enabled: true,
        ketidakhadiran_enabled: false,
        updated_at: now,
      });
    });

    it('should allow enabling both kehadiran and ketidakhadiran notifications', async () => {
      const now = new Date();

      // Query 1: find siswa → belongs to parentUserId
      mockDb.select.mockReturnValueOnce(
        createChainableMock([{ id: siswaId2, orangTuaId: parentUserId }]),
      );

      // Insert/upsert → returns the upserted record
      const insertMock = createInsertMock([
        {
          id: 'pref-new-2',
          userId: parentUserId,
          siswaId: siswaId2,
          kehadiranEnabled: true,
          ketidakhadiranEnabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      mockDb.insert.mockReturnValueOnce(insertMock);

      const result = await service.updatePreferensi(parentUserId, {
        anak_id: siswaId2,
        kehadiran_enabled: true,
        ketidakhadiran_enabled: true,
      });

      expect(result).toEqual({
        anak_id: siswaId2,
        kehadiran_enabled: true,
        ketidakhadiran_enabled: true,
        updated_at: now,
      });
    });
  });
});

describe('NotifikasiService — Riwayat API (Task 10.6)', () => {
  let service: NotifikasiService;

  const parentUserId = 'parent-1111-1111-1111-111111111111';

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifikasiService,
        {
          provide: DrizzleService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<NotifikasiService>(NotifikasiService);
  });

  describe('getRiwayat', () => {
    it('should return empty data array when parent has no notifications', async () => {
      // No cursor provided, query returns empty
      mockDb.select.mockReturnValueOnce(createChainableMock([]));

      const result = await service.getRiwayat(parentUserId, {});

      expect(result.data).toEqual([]);
      expect(result.meta.has_next).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should return notifications sorted newest first with delivery status', async () => {
      const notif1 = {
        id: 'notif-1',
        tipe: 'absensi',
        judul: 'Absensi Andi',
        pesan: 'Status: alpa',
        data: { siswa_id: 'siswa-1' },
        statusPengiriman: 'terkirim',
        createdAt: new Date('2024-06-15T08:00:00Z'),
      };
      const notif2 = {
        id: 'notif-2',
        tipe: 'tagihan_baru',
        judul: 'Tagihan SPP Juni',
        pesan: 'Tagihan baru bulan Juni',
        data: null,
        statusPengiriman: 'gagal',
        createdAt: new Date('2024-06-14T10:00:00Z'),
      };

      // Returns exactly 2 rows (limit+1 check not triggered)
      mockDb.select.mockReturnValueOnce(createChainableMock([notif1, notif2]));

      const result = await service.getRiwayat(parentUserId, { limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'notif-1',
        tipe: 'absensi',
        judul: 'Absensi Andi',
        pesan: 'Status: alpa',
        data: { siswa_id: 'siswa-1' },
        status_pengiriman: 'terkirim',
        created_at: new Date('2024-06-15T08:00:00Z'),
      });
      expect(result.data[1]).toEqual({
        id: 'notif-2',
        tipe: 'tagihan_baru',
        judul: 'Tagihan SPP Juni',
        pesan: 'Tagihan baru bulan Juni',
        data: null,
        status_pengiriman: 'gagal',
        created_at: new Date('2024-06-14T10:00:00Z'),
      });
      expect(result.meta.has_next).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should paginate with cursor and signal has_next when more results exist', async () => {
      const cursorNotif = {
        createdAt: new Date('2024-06-13T10:00:00Z'),
      };

      const page2Notif1 = {
        id: 'notif-3',
        tipe: 'absensi',
        judul: 'Absensi Budi',
        pesan: 'Status: sakit',
        data: null,
        statusPengiriman: 'terkirim',
        createdAt: new Date('2024-06-12T08:00:00Z'),
      };
      const page2Notif2 = {
        id: 'notif-4',
        tipe: 'absensi',
        judul: 'Absensi Cici',
        pesan: 'Status: izin',
        data: null,
        statusPengiriman: 'terkirim',
        createdAt: new Date('2024-06-11T08:00:00Z'),
      };
      // Extra row signals has_next = true
      const extraNotif = {
        id: 'notif-5',
        tipe: 'absensi',
        judul: 'Extra',
        pesan: 'Extra',
        data: null,
        statusPengiriman: 'terkirim',
        createdAt: new Date('2024-06-10T08:00:00Z'),
      };

      // First query: resolve cursor notification's createdAt
      mockDb.select.mockReturnValueOnce(createChainableMock([cursorNotif]));

      // Second query: fetch notifications (limit=2, so fetch 3 to check has_next)
      mockDb.select.mockReturnValueOnce(
        createChainableMock([page2Notif1, page2Notif2, extraNotif]),
      );

      const result = await service.getRiwayat(parentUserId, {
        cursor: 'notif-2',
        limit: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('notif-3');
      expect(result.data[1].id).toBe('notif-4');
      expect(result.meta.has_next).toBe(true);
      expect(result.meta.cursor).toBe('notif-4');
    });

    it('should use default limit of 20 when limit is not provided', async () => {
      // Generate 21 items to trigger has_next detection
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `notif-${i}`,
        tipe: 'absensi',
        judul: `Notif ${i}`,
        pesan: `Pesan ${i}`,
        data: null,
        statusPengiriman: 'terkirim',
        createdAt: new Date(`2024-06-${String(20 - i).padStart(2, '0')}T08:00:00Z`),
      }));

      mockDb.select.mockReturnValueOnce(createChainableMock(items));

      const result = await service.getRiwayat(parentUserId, {});

      // Should return exactly 20 items (default limit), not 21
      expect(result.data).toHaveLength(20);
      expect(result.meta.has_next).toBe(true);
      expect(result.meta.cursor).toBe('notif-19');
    });
  });
});
