import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TagihanService } from './tagihan.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { StorageService } from '@/modules/storage/storage.service';
import { AuditTrailService } from './audit-trail.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

/**
 * TagihanService Unit Tests — Management Operations (delete, edit, cancel)
 *
 * Requirements: 34.1–34.7
 */
describe('TagihanService - Tagihan Management (delete, edit, cancel)', () => {
  let service: TagihanService;
  let mockAuditTrailService: { record: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const tagihanId = '33333333-3333-3333-3333-333333333333';

  const belumBayarTagihan = {
    id: tagihanId,
    tenantId,
    siswaId: '44444444-4444-4444-4444-444444444444',
    bulan: 9,
    tahun: 2024,
    nominal: 250000,
    totalDibayar: 0,
    status: 'belum_bayar',
    tanggalJatuhTempo: '2024-09-10',
    alasanPembatalan: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let selectResults: any[][];
  let selectCallIndex: number;
  let deleteCalled: boolean;
  let insertValues: any[];
  let updateSets: any[];

  const createMockDb = () => {
    selectCallIndex = 0;
    deleteCalled = false;
    insertValues = [];
    updateSets = [];

    const selectChain: any = {};
    selectChain.from = jest.fn().mockReturnValue(selectChain);
    selectChain.where = jest.fn().mockReturnValue(selectChain);
    selectChain.limit = jest.fn().mockImplementation(() => {
      const result = selectResults[selectCallIndex] || [];
      selectCallIndex++;
      return Promise.resolve(result);
    });

    const deleteChain: any = {};
    deleteChain.where = jest.fn().mockImplementation(() => {
      deleteCalled = true;
      return Promise.resolve();
    });

    const insertChain: any = {};
    insertChain.values = jest.fn().mockImplementation((vals: any) => {
      insertValues.push(vals);
      return Promise.resolve();
    });

    const updateChain: any = {};
    updateChain.set = jest.fn().mockImplementation((vals: any) => {
      updateSets.push(vals);
      return updateChain;
    });
    updateChain.where = jest.fn().mockReturnValue(Promise.resolve());

    return {
      select: jest.fn().mockReturnValue(selectChain),
      delete: jest.fn().mockReturnValue(deleteChain),
      insert: jest.fn().mockReturnValue(insertChain),
      update: jest.fn().mockReturnValue(updateChain),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    mockDb = createMockDb();
    mockAuditTrailService = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: { upload: jest.fn() } },
        {
          provide: KonfigurasiService,
          useValue: { getConfigByKey: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: RedisService,
          useValue: { acquireLock: jest.fn().mockResolvedValue(true), releaseLock: jest.fn() },
        },
        { provide: AuditTrailService, useValue: mockAuditTrailService },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  // ═══════════════════════════════════════════════════════════════════
  // DELETE /tagihan/:id (Requirements: 34.1, 34.2)
  // ═══════════════════════════════════════════════════════════════════

  describe('deleteTagihan', () => {
    /**
     * Requirement 34.1: Delete only allowed if status is 'belum_bayar'.
     */
    it('should delete tagihan when status is belum_bayar', async () => {
      selectResults = [[belumBayarTagihan]];

      await service.deleteTagihan(tenantId, userId, tagihanId);

      expect(deleteCalled).toBe(true);
    });

    /**
     * Requirement 34.7: Should record deletion in audit trail.
     */
    it('should record deletion in audit trail with correct values', async () => {
      selectResults = [[belumBayarTagihan]];

      await service.deleteTagihan(tenantId, userId, tagihanId);

      expect(mockAuditTrailService.record).toHaveBeenCalledWith({
        tenantId,
        userId,
        jenisAksi: 'hapus_tagihan',
        entityType: 'tagihan',
        entityId: tagihanId,
        nilaiSebelum: {
          nominal: 250000,
          bulan: 9,
          tahun: 2024,
          status: 'belum_bayar',
          siswa_id: belumBayarTagihan.siswaId,
        },
        nilaiSesudah: null,
        alasan: null,
      });
    });

    /**
     * Requirement 34.2: Reject deletion if status is not belum_bayar.
     */
    it('should throw BadRequestException when status is menunggu_verifikasi', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'menunggu_verifikasi' }]];

      await expect(service.deleteTagihan(tenantId, userId, tagihanId)).rejects.toThrow(
        'Tagihan tidak dapat dihapus karena sudah ada aktivitas pembayaran',
      );
    });

    it('should throw BadRequestException when status is lunas', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'lunas' }]];

      await expect(service.deleteTagihan(tenantId, userId, tagihanId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when status is cicilan', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'cicilan' }]];

      await expect(service.deleteTagihan(tenantId, userId, tagihanId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when tagihan does not exist', async () => {
      selectResults = [[]];

      await expect(service.deleteTagihan(tenantId, userId, tagihanId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PATCH /tagihan/:id (Requirements: 34.3, 34.4)
  // ═══════════════════════════════════════════════════════════════════

  describe('editTagihan', () => {
    /**
     * Requirement 34.3: Edit nominal only when status is belum_bayar.
     */
    it('should update nominal when status is belum_bayar', async () => {
      selectResults = [[belumBayarTagihan]];

      const result = await service.editTagihan(tenantId, userId, tagihanId, {
        nominal: 300000,
      });

      expect(result.nominal_sebelum).toBe(250000);
      expect(result.nominal_sesudah).toBe(300000);
      expect(result.tagihan_id).toBe(tagihanId);
      expect(updateSets[0]).toEqual(expect.objectContaining({ nominal: 300000 }));
    });

    /**
     * Requirement 34.7: Should record edit in audit trail.
     */
    it('should record edit in audit trail with before/after values', async () => {
      selectResults = [[belumBayarTagihan]];

      await service.editTagihan(tenantId, userId, tagihanId, { nominal: 300000 });

      expect(mockAuditTrailService.record).toHaveBeenCalledWith({
        tenantId,
        userId,
        jenisAksi: 'edit_tagihan',
        entityType: 'tagihan',
        entityId: tagihanId,
        nilaiSebelum: { nominal: 250000 },
        nilaiSesudah: { nominal: 300000 },
        alasan: null,
      });
    });

    /**
     * Requirement 34.4: Reject edit when status is not belum_bayar.
     */
    it('should throw BadRequestException when status is menunggu_verifikasi', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'menunggu_verifikasi' }]];

      await expect(
        service.editTagihan(tenantId, userId, tagihanId, { nominal: 300000 }),
      ).rejects.toThrow('Nominal tidak dapat diubah karena sudah ada aktivitas pembayaran');
    });

    it('should throw BadRequestException when status is cicilan', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'cicilan' }]];

      await expect(
        service.editTagihan(tenantId, userId, tagihanId, { nominal: 300000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when tagihan does not exist', async () => {
      selectResults = [[]];

      await expect(
        service.editTagihan(tenantId, userId, tagihanId, { nominal: 300000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PATCH /tagihan/:id/cancel (Requirements: 34.5, 34.6)
  // ═══════════════════════════════════════════════════════════════════

  describe('cancelTagihan', () => {
    /**
     * Requirement 34.5: Cancel tagihan sets status to 'dibatalkan' and records alasan.
     */
    it('should cancel tagihan when status is belum_bayar', async () => {
      selectResults = [[belumBayarTagihan]];

      const result = await service.cancelTagihan(tenantId, userId, tagihanId, {
        alasan: 'Siswa mendapat beasiswa',
      });

      expect(result.status).toBe('dibatalkan');
      expect(result.alasan).toBe('Siswa mendapat beasiswa');
      expect(result.tagihan_id).toBe(tagihanId);
      expect(updateSets[0]).toEqual(
        expect.objectContaining({
          status: 'dibatalkan',
          alasanPembatalan: 'Siswa mendapat beasiswa',
        }),
      );
    });

    /**
     * Requirement 34.7: Should record cancellation in audit trail.
     */
    it('should record cancellation in audit trail with alasan', async () => {
      selectResults = [[belumBayarTagihan]];

      await service.cancelTagihan(tenantId, userId, tagihanId, {
        alasan: 'Keringanan biaya',
      });

      expect(mockAuditTrailService.record).toHaveBeenCalledWith({
        tenantId,
        userId,
        jenisAksi: 'batalkan_tagihan',
        entityType: 'tagihan',
        entityId: tagihanId,
        nilaiSebelum: { status: 'belum_bayar' },
        nilaiSesudah: { status: 'dibatalkan' },
        alasan: 'Keringanan biaya',
      });
    });

    /**
     * Requirement 34.6: Only belum_bayar can be cancelled.
     */
    it('should throw BadRequestException when status is menunggu_verifikasi', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'menunggu_verifikasi' }]];

      await expect(
        service.cancelTagihan(tenantId, userId, tagihanId, { alasan: 'Test' }),
      ).rejects.toThrow('Tagihan tidak dapat dibatalkan karena sudah ada aktivitas pembayaran');
    });

    it('should throw BadRequestException when status is lunas', async () => {
      selectResults = [[{ ...belumBayarTagihan, status: 'lunas' }]];

      await expect(
        service.cancelTagihan(tenantId, userId, tagihanId, { alasan: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when tagihan does not exist', async () => {
      selectResults = [[]];

      await expect(
        service.cancelTagihan(tenantId, userId, tagihanId, { alasan: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
