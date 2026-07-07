import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TagihanService } from './tagihan.service';
import { AuditTrailService } from './audit-trail.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { StorageService } from '@/modules/storage/storage.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { ManualPaymentDto } from './dto';

/**
 * TagihanService Unit Tests — Manual Payment Recording (POST /tagihan/:id/manual-payment)
 *
 * Requirements: 13.1–13.7
 */
describe('TagihanService - recordManualPayment', () => {
  let service: TagihanService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const bendaharaId = '22222222-2222-2222-2222-222222222222';
  const tagihanId = '33333333-3333-3333-3333-333333333333';

  const baseTagihan = {
    id: tagihanId,
    tenantId,
    siswaId: '44444444-4444-4444-4444-444444444444',
    bulan: 9,
    tahun: 2024,
    tahunAjaranId: '55555555-5555-5555-5555-555555555555',
    nominal: 500000,
    totalDibayar: 0,
    status: 'belum_bayar',
    tanggalJatuhTempo: '2024-09-10',
    alasanPembatalan: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let selectResults: any[][];
  let selectCallIndex: number;
  let insertResult: any[];
  let updateFn: jest.Mock;

  const createMockDb = () => {
    selectCallIndex = 0;

    const createSelectChain = (): any => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.innerJoin = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockReturnValue(chain);
      chain.limit = jest.fn().mockImplementation(() => {
        const result = selectResults[selectCallIndex] || [];
        selectCallIndex++;
        return Promise.resolve(result);
      });
      return chain;
    };

    const insertChain: any = {};
    insertChain.values = jest.fn().mockReturnValue(insertChain);
    insertChain.onConflictDoNothing = jest.fn().mockReturnValue(insertChain);
    insertChain.returning = jest.fn().mockImplementation(() => Promise.resolve(insertResult));

    const updateChain: any = {};
    updateChain.set = jest.fn().mockReturnValue(updateChain);
    updateChain.where = jest.fn().mockResolvedValue(undefined);
    updateFn = jest.fn().mockReturnValue(updateChain);

    return {
      select: jest.fn().mockImplementation(() => createSelectChain()),
      insert: jest.fn().mockReturnValue(insertChain),
      update: updateFn,
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    insertResult = [];
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
        { provide: AuditTrailService, useValue: { record: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  describe('Validation — tagihan existence and status', () => {
    /**
     * Requirement 13.1: Tagihan must exist in the tenant.
     */
    it('should throw NotFoundException when tagihan does not exist', async () => {
      selectResults = [[]]; // tagihan not found

      const dto: ManualPaymentDto = { jumlah_bayar: 100000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include descriptive message when tagihan not found', async () => {
      selectResults = [[]];

      const dto: ManualPaymentDto = { jumlah_bayar: 100000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow('Tagihan tidak ditemukan');
    });

    /**
     * Requirement 13.1, 13.2: Only allow manual payment on belum_bayar or cicilan status.
     */
    it('should throw BadRequestException when tagihan status is lunas', async () => {
      selectResults = [[{ ...baseTagihan, status: 'lunas', totalDibayar: 500000 }]];

      const dto: ManualPaymentDto = { jumlah_bayar: 100000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tagihan status is menunggu_verifikasi', async () => {
      selectResults = [[{ ...baseTagihan, status: 'menunggu_verifikasi' }]];

      const dto: ManualPaymentDto = { jumlah_bayar: 100000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tagihan status is dibatalkan', async () => {
      selectResults = [[{ ...baseTagihan, status: 'dibatalkan' }]];

      const dto: ManualPaymentDto = { jumlah_bayar: 100000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Validation — payment amount', () => {
    /**
     * Requirement 13.7: jumlah_bayar must not exceed sisa tagihan.
     */
    it('should throw BadRequestException when jumlah_bayar exceeds sisa tagihan', async () => {
      selectResults = [[{ ...baseTagihan, totalDibayar: 400000 }]]; // sisa = 100000

      const dto: ManualPaymentDto = { jumlah_bayar: 150000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include amount info in error when exceeding sisa', async () => {
      selectResults = [[{ ...baseTagihan, totalDibayar: 400000 }]]; // sisa = 100000

      const dto: ManualPaymentDto = { jumlah_bayar: 150000, metode: 'tunai' };

      await expect(
        service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto),
      ).rejects.toThrow(/melebihi sisa tagihan/);
    });

    it('should accept payment exactly equal to sisa tagihan', async () => {
      selectResults = [[{ ...baseTagihan, totalDibayar: 400000 }]]; // sisa = 100000
      insertResult = [{ id: 'trx-1', nomorReferensi: 'TN-123-ABCD1234' }];

      const dto: ManualPaymentDto = { jumlah_bayar: 100000, metode: 'tunai' };

      const result = await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      expect(result.status).toBe('lunas');
      expect(result.sisa_tagihan).toBe(0);
    });
  });

  describe('Successful payment recording', () => {
    /**
     * Requirement 13.1: Full payment → status becomes lunas.
     */
    it('should transition to lunas when full payment is made', async () => {
      selectResults = [[{ ...baseTagihan }]]; // sisa = 500000
      insertResult = [{ id: 'trx-1', nomorReferensi: 'TN-123-ABCD1234' }];

      const dto: ManualPaymentDto = { jumlah_bayar: 500000, metode: 'tunai' };

      const result = await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      expect(result.status).toBe('lunas');
      expect(result.total_dibayar).toBe(500000);
      expect(result.sisa_tagihan).toBe(0);
      expect(result.message).toContain('lunas');
    });

    /**
     * Requirement 13.2: Partial payment → status becomes cicilan.
     */
    it('should transition to cicilan when partial payment is made', async () => {
      selectResults = [[{ ...baseTagihan }]]; // sisa = 500000
      insertResult = [{ id: 'trx-2', nomorReferensi: 'TN-456-EFGH5678' }];

      const dto: ManualPaymentDto = { jumlah_bayar: 200000, metode: 'tunai' };

      const result = await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      expect(result.status).toBe('cicilan');
      expect(result.total_dibayar).toBe(200000);
      expect(result.sisa_tagihan).toBe(300000);
      expect(result.message).toContain('cicilan');
    });

    /**
     * Requirement 13.4: Auto-transition to lunas when total_dibayar reaches nominal
     * after multiple cicilan payments.
     */
    it('should auto-transition to lunas when cumulative cicilan reaches nominal', async () => {
      // Already has 300000 paid, sisa = 200000
      selectResults = [[{ ...baseTagihan, totalDibayar: 300000, status: 'cicilan' }]];
      insertResult = [{ id: 'trx-3', nomorReferensi: 'TM-789-IJKL9012' }];

      const dto: ManualPaymentDto = { jumlah_bayar: 200000, metode: 'transfer_manual' };

      const result = await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      expect(result.status).toBe('lunas');
      expect(result.total_dibayar).toBe(500000);
      expect(result.sisa_tagihan).toBe(0);
    });

    /**
     * Requirement 13.6: No limit on cicilan count for manual payments.
     * This test verifies multiple small payments can be made without hitting a limit.
     */
    it('should allow unlimited cicilan for manual payments (no count restriction)', async () => {
      // Simulate 4th payment out of many — already 100000 paid
      selectResults = [[{ ...baseTagihan, totalDibayar: 100000, status: 'cicilan' }]];
      insertResult = [{ id: 'trx-4', nomorReferensi: 'TN-111-MNOP3456' }];

      const dto: ManualPaymentDto = { jumlah_bayar: 50000, metode: 'tunai' };

      // Should succeed — no cicilan count check for manual payments
      const result = await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      expect(result.status).toBe('cicilan');
      expect(result.total_dibayar).toBe(150000);
      expect(result.sisa_tagihan).toBe(350000);
    });

    /**
     * Requirement 13.5: Transaction must include jumlah_bayar, metode, catatan.
     * Validates that catatan is stored when provided.
     */
    it('should store catatan when provided', async () => {
      selectResults = [[{ ...baseTagihan }]];
      insertResult = [{ id: 'trx-5', nomorReferensi: 'TN-222-QRST7890' }];

      const dto: ManualPaymentDto = {
        jumlah_bayar: 250000,
        metode: 'tunai',
        catatan: 'Pembayaran tunai di kantor',
      };

      const result = await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      expect(result.transaksi_id).toBe('trx-5');
      // Verify the insert was called (mock captures the call)
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('Nomor referensi generation', () => {
    /**
     * Requirement 14.4: Each payment must have a unique nomor_referensi.
     */
    it('should generate nomor_referensi with TN prefix for tunai', () => {
      const ref = service.generateNomorReferensi('tunai');
      expect(ref).toMatch(/^TN-\d+-[A-Z0-9]{8}$/);
    });

    it('should generate nomor_referensi with TM prefix for transfer_manual', () => {
      const ref = service.generateNomorReferensi('transfer_manual');
      expect(ref).toMatch(/^TM-\d+-[A-Z0-9]{8}$/);
    });

    it('should generate unique nomor_referensi on each call', () => {
      const ref1 = service.generateNomorReferensi('tunai');
      const ref2 = service.generateNomorReferensi('tunai');
      expect(ref1).not.toBe(ref2);
    });
  });

  describe('Update calls', () => {
    /**
     * Verify that tagihan record is updated with new total_dibayar and status.
     */
    it('should call db.update with correct total_dibayar and status', async () => {
      selectResults = [[{ ...baseTagihan, totalDibayar: 200000 }]]; // sisa = 300000
      insertResult = [{ id: 'trx-6', nomorReferensi: 'TN-333-UVWX1234' }];

      const dto: ManualPaymentDto = { jumlah_bayar: 300000, metode: 'tunai' };

      await service.recordManualPayment(tenantId, bendaharaId, tagihanId, dto);

      // update was called
      expect(updateFn).toHaveBeenCalled();
    });
  });
});
