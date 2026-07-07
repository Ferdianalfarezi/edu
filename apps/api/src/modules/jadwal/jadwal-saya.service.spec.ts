import { Test, TestingModule } from '@nestjs/testing';
import { JadwalService } from './jadwal.service';
import { DrizzleService } from '@/drizzle/drizzle.service';

describe('JadwalService - getJadwalSaya', () => {
  let service: JadwalService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const guruId = '55555555-5555-5555-5555-555555555555';
  const kelasId = '33333333-3333-3333-3333-333333333333';
  const mapelId = '44444444-4444-4444-4444-444444444444';

  // Chain-able query builder mock
  const createChainMock = (returnValue: unknown = []) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.values = jest.fn().mockReturnValue(chain);
    chain.set = jest.fn().mockReturnValue(chain);
    chain.returning = jest
      .fn()
      .mockResolvedValue(Array.isArray(returnValue) ? returnValue : [returnValue]);
    chain.then = jest
      .fn()
      .mockImplementation((resolve) =>
        resolve(Array.isArray(returnValue) ? returnValue : [returnValue]),
      );
    return chain;
  };

  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JadwalService,
        {
          provide: DrizzleService,
          useValue: {
            db: mockDb,
          },
        },
      ],
    }).compile();

    service = module.get<JadwalService>(JadwalService);
  });

  describe('getJadwalSaya', () => {
    it('should return guru schedule for today when no filters provided', async () => {
      // Mock jadwal query result — guru has 2 slots today
      const jadwalSlots = [
        {
          id: 'jadwal-1',
          kelasId,
          kelasNama: '6A',
          mataPelajaranId: mapelId,
          mataPelajaranNama: 'Matematika',
          jamMulai: '08:00:00',
          jamSelesai: '09:30:00',
        },
        {
          id: 'jadwal-2',
          kelasId: 'kelas-2',
          kelasNama: '6B',
          mataPelajaranId: 'mapel-2',
          mataPelajaranNama: 'IPA',
          jamMulai: '10:00:00',
          jamSelesai: '11:30:00',
        },
      ];

      // First call: query jadwal slots
      const jadwalChain = createChainMock(jadwalSlots);
      // Subsequent calls: check guru_pengganti for each slot (none assigned)
      const pengganti1Chain = createChainMock([]);
      const pengganti2Chain = createChainMock([]);

      mockDb.select
        .mockReturnValueOnce(jadwalChain) // jadwal query
        .mockReturnValueOnce(pengganti1Chain) // guru_pengganti check for slot 1
        .mockReturnValueOnce(pengganti2Chain); // guru_pengganti check for slot 2

      const result = await service.getJadwalSaya(tenantId, guruId, {});

      expect(result.jadwal).toHaveLength(2);
      expect(result.jadwal[0]).toEqual({
        id: 'jadwal-1',
        kelasNama: '6A',
        mataPelajaranNama: 'Matematika',
        jamMulai: '08:00:00',
        jamSelesai: '09:30:00',
        hasGuruPengganti: false,
        guruPenggantiNama: undefined,
      });
      expect(result.jadwal[1]).toEqual({
        id: 'jadwal-2',
        kelasNama: '6B',
        mataPelajaranNama: 'IPA',
        jamMulai: '10:00:00',
        jamSelesai: '11:30:00',
        hasGuruPengganti: false,
        guruPenggantiNama: undefined,
      });
      expect(result.hari).toBeDefined();
      expect(result.tanggal).toBeDefined();
    });

    it('should filter by specified hari and show guru_pengganti when assigned', async () => {
      const jadwalSlots = [
        {
          id: 'jadwal-1',
          kelasId,
          kelasNama: '6A',
          mataPelajaranId: mapelId,
          mataPelajaranNama: 'Matematika',
          jamMulai: '08:00:00',
          jamSelesai: '09:30:00',
        },
      ];

      // Jadwal query returns 1 slot
      const jadwalChain = createChainMock(jadwalSlots);
      // Guru pengganti IS assigned for this slot
      const penggantiChain = createChainMock([{ id: 'pengganti-1', guruPenggantiNama: 'Bu Siti' }]);

      mockDb.select.mockReturnValueOnce(jadwalChain).mockReturnValueOnce(penggantiChain);

      const result = await service.getJadwalSaya(tenantId, guruId, {
        hari: 'selasa',
        tanggal: '2024-10-15',
      });

      expect(result.hari).toBe('selasa');
      expect(result.tanggal).toBe('2024-10-15');
      expect(result.jadwal).toHaveLength(1);
      expect(result.jadwal[0].hasGuruPengganti).toBe(true);
      expect(result.jadwal[0].guruPenggantiNama).toBe('Bu Siti');
    });

    it('should return empty schedule when no jadwal matches', async () => {
      // No jadwal for this guru today
      const jadwalChain = createChainMock([]);
      mockDb.select.mockReturnValueOnce(jadwalChain);

      const result = await service.getJadwalSaya(tenantId, guruId, { hari: 'sabtu' });

      expect(result.hari).toBe('sabtu');
      expect(result.jadwal).toHaveLength(0);
    });

    it('should use tanggal param to determine date context for guru_pengganti check', async () => {
      const jadwalSlots = [
        {
          id: 'jadwal-1',
          kelasId,
          kelasNama: '6A',
          mataPelajaranId: mapelId,
          mataPelajaranNama: 'Matematika',
          jamMulai: '08:00:00',
          jamSelesai: '09:30:00',
        },
      ];

      const jadwalChain = createChainMock(jadwalSlots);
      // No pengganti for the specified future date
      const penggantiChain = createChainMock([]);

      mockDb.select.mockReturnValueOnce(jadwalChain).mockReturnValueOnce(penggantiChain);

      const result = await service.getJadwalSaya(tenantId, guruId, {
        hari: 'rabu',
        tanggal: '2024-12-25',
      });

      expect(result.tanggal).toBe('2024-12-25');
      expect(result.hari).toBe('rabu');
      expect(result.jadwal[0].hasGuruPengganti).toBe(false);
    });
  });
});
