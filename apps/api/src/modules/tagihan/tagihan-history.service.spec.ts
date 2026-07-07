import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TagihanService } from './tagihan.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { StorageService } from '@/modules/storage/storage.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { AuditTrailService } from './audit-trail.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

/**
 * TagihanService Unit Tests — Payment History & Receipt (Requirements: 14.1–14.6)
 *
 * Tests the orang_tua endpoints:
 * - GET /tagihan/siswa/:siswaId — list all tagihan per child with ownership validation
 * - GET /tagihan/:id/bukti-bayar — generate receipt JSON with payment details
 */
describe('TagihanService - Payment History & Receipt', () => {
  let service: TagihanService;

  const userId = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const siswaId = 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const tagihanId = 'cccc3333-cccc-cccc-cccc-cccccccccccc';
  const kelasId = 'dddd4444-dddd-dddd-dddd-dddddddddddd';
  const transaksiId = 'eeee5555-eeee-eeee-eeee-eeeeeeeeeeee';

  let selectResults: any[][];
  let selectCallIndex: number;

  const createMockDb = () => {
    selectCallIndex = 0;

    const createSelectChain = (): any => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockReturnValue(chain);
      chain.limit = jest.fn().mockImplementation(() => {
        const result = selectResults[selectCallIndex] || [];
        selectCallIndex++;
        return Promise.resolve(result);
      });
      chain.orderBy = jest.fn().mockImplementation(() => {
        const result = selectResults[selectCallIndex] || [];
        selectCallIndex++;
        return Promise.resolve(result);
      });
      // Allow awaiting directly when .where() is the terminal call
      chain.then = (resolve: any, reject?: any) => {
        const result = selectResults[selectCallIndex] || [];
        selectCallIndex++;
        return Promise.resolve(result).then(resolve, reject);
      };
      return chain;
    };

    return {
      select: jest.fn().mockImplementation(() => createSelectChain()),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
          returning: jest.fn().mockResolvedValue([]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    selectCallIndex = 0;
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: { upload: jest.fn() } },
        {
          provide: KonfigurasiService,
          useValue: { getConfigByKey: jest.fn().mockResolvedValue({ value: {} }) },
        },
        { provide: RedisService, useValue: { acquireLock: jest.fn(), releaseLock: jest.fn() } },
        {
          provide: AuditTrailService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /tagihan/siswa/:siswaId — getTagihanBySiswa
  // ═══════════════════════════════════════════════════════════════════

  describe('getTagihanBySiswa', () => {
    it('should return all tagihan for a valid child owned by the parent', async () => {
      const tagihanList = [
        {
          id: 'tag-1',
          bulan: 7,
          tahun: 2024,
          nominal: 500000,
          status: 'lunas',
          totalDibayar: 500000,
          tanggalJatuhTempo: '2024-07-10',
        },
        {
          id: 'tag-2',
          bulan: 8,
          tahun: 2024,
          nominal: 500000,
          status: 'belum_bayar',
          totalDibayar: 0,
          tanggalJatuhTempo: '2024-08-10',
        },
        {
          id: 'tag-3',
          bulan: 9,
          tahun: 2024,
          nominal: 500000,
          status: 'cicilan',
          totalDibayar: 250000,
          tanggalJatuhTempo: '2024-09-10',
        },
      ];

      // First query: siswa ownership check (ends with .limit(1))
      // Second query: tagihan list (ends with .orderBy())
      selectResults = [[{ id: siswaId, nama: 'Budi', orangTuaId: userId }], tagihanList];

      const result = await service.getTagihanBySiswa(userId, siswaId);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'tag-1',
        bulan: 7,
        tahun: 2024,
        nominal: 500000,
        status: 'lunas',
        total_dibayar: 500000,
        sisa: 0,
        tanggal_jatuh_tempo: '2024-07-10',
      });
      expect(result[2]).toEqual({
        id: 'tag-3',
        bulan: 9,
        tahun: 2024,
        nominal: 500000,
        status: 'cicilan',
        total_dibayar: 250000,
        sisa: 250000,
        tanggal_jatuh_tempo: '2024-09-10',
      });
    });

    it('should throw ForbiddenException when parent does not own the child', async () => {
      // Siswa query returns empty (parent doesn't own this child)
      selectResults = [[]];

      await expect(service.getTagihanBySiswa(userId, siswaId)).rejects.toThrow(ForbiddenException);
    });

    it('should return empty array when child has no tagihan', async () => {
      selectResults = [
        [{ id: siswaId, nama: 'Budi', orangTuaId: userId }],
        [], // no tagihan
      ];

      const result = await service.getTagihanBySiswa(userId, siswaId);
      expect(result).toEqual([]);
    });

    it('should correctly calculate sisa for each tagihan', async () => {
      selectResults = [
        [{ id: siswaId, nama: 'Budi', orangTuaId: userId }],
        [
          {
            id: 'tag-1',
            bulan: 1,
            tahun: 2024,
            nominal: 600000,
            status: 'cicilan',
            totalDibayar: 350000,
            tanggalJatuhTempo: '2024-01-10',
          },
        ],
      ];

      const result = await service.getTagihanBySiswa(userId, siswaId);

      expect(result[0].sisa).toBe(250000); // 600000 - 350000
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /tagihan/:id/bukti-bayar — getBuktiBayar
  // ═══════════════════════════════════════════════════════════════════

  describe('getBuktiBayar', () => {
    const baseTagihan = {
      id: tagihanId,
      tenantId: 'tenant-1',
      siswaId,
      bulan: 8,
      tahun: 2024,
      nominal: 500000,
      totalDibayar: 500000,
      status: 'lunas',
      tanggalJatuhTempo: '2024-08-10',
      tahunAjaranId: 'ta-1',
      alasanPembatalan: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseTransaction = {
      id: transaksiId,
      tenantId: 'tenant-1',
      tagihanId,
      jumlahBayar: 500000,
      metode: 'tunai',
      status: 'approved',
      buktiTransferUrl: null,
      catatan: null,
      alasanPenolakan: null,
      verifiedBy: 'bendahara-1',
      verifiedAt: new Date('2024-08-05'),
      uploadedBy: null,
      nomorReferensi: 'TN-1722852000000-ABCDEF01',
      createdAt: new Date('2024-08-05'),
    };

    it('should return receipt with payment details for a valid tagihan', async () => {
      selectResults = [
        [baseTagihan], // tagihan lookup (.limit)
        [{ id: siswaId, nama: 'Budi Santoso', kelasId }], // siswa ownership (.limit)
        [{ nama: '2A' }], // kelas lookup (.limit)
        [baseTransaction], // transactions (.where terminal)
      ];

      const result = await service.getBuktiBayar(userId, tagihanId);

      expect(result.tagihan_id).toBe(tagihanId);
      expect(result.siswa_nama).toBe('Budi Santoso');
      expect(result.kelas).toBe('2A');
      expect(result.bulan).toBe(8);
      expect(result.tahun).toBe(2024);
      expect(result.nominal_tagihan).toBe(500000);
      expect(result.status).toBe('lunas');
      expect(result.pembayaran).toHaveLength(1);
      expect(result.pembayaran[0].nominal_bayar).toBe(500000);
      expect(result.pembayaran[0].metode).toBe('tunai');
      expect(result.pembayaran[0].nomor_referensi).toBe('TN-1722852000000-ABCDEF01');
    });

    it('should throw NotFoundException when tagihan does not exist', async () => {
      selectResults = [[]]; // tagihan not found

      await expect(service.getBuktiBayar(userId, tagihanId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when parent does not own the child', async () => {
      selectResults = [
        [baseTagihan], // tagihan found
        [], // siswa ownership fails
      ];

      await expect(service.getBuktiBayar(userId, tagihanId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when no approved payments exist', async () => {
      selectResults = [
        [baseTagihan], // tagihan found
        [{ id: siswaId, nama: 'Budi', kelasId }], // siswa valid
        [{ nama: '2A' }], // kelas info
        [], // no approved transactions
      ];

      await expect(service.getBuktiBayar(userId, tagihanId)).rejects.toThrow(NotFoundException);
    });

    it('should return multiple payment entries for cicilan tagihan', async () => {
      const transaction1 = {
        ...baseTransaction,
        id: 'tx-1',
        jumlahBayar: 250000,
        nomorReferensi: 'TN-111-AAAAAAAA',
        createdAt: new Date('2024-08-01'),
      };
      const transaction2 = {
        ...baseTransaction,
        id: 'tx-2',
        jumlahBayar: 250000,
        nomorReferensi: 'TN-222-BBBBBBBB',
        createdAt: new Date('2024-08-15'),
      };

      selectResults = [
        [{ ...baseTagihan }],
        [{ id: siswaId, nama: 'Budi', kelasId }],
        [{ nama: '3B' }],
        [transaction1, transaction2],
      ];

      const result = await service.getBuktiBayar(userId, tagihanId);

      expect(result.pembayaran).toHaveLength(2);
      expect(result.pembayaran[0].nomor_referensi).toBe('TN-111-AAAAAAAA');
      expect(result.pembayaran[1].nomor_referensi).toBe('TN-222-BBBBBBBB');
    });

    it('should handle siswa without kelas (kelasId is null)', async () => {
      selectResults = [
        [baseTagihan],
        [{ id: siswaId, nama: 'Budi', kelasId: null }], // no kelas
        // No kelas query since kelasId is null
        [baseTransaction], // transactions
      ];

      const result = await service.getBuktiBayar(userId, tagihanId);

      expect(result.kelas).toBe('-');
      expect(result.siswa_nama).toBe('Budi');
    });
  });
});
