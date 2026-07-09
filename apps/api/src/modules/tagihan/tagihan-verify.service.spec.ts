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
import { VerifyPaymentDto } from './dto';

/**
 * TagihanService Unit Tests — Payment Verification (PATCH /tagihan/:id/verify)
 *
 * Requirements: 12.1–12.8
 */
describe('TagihanService - verifyPayment', () => {
  let service: TagihanService;
  let mockNotificationQueue: { add: jest.Mock };
  let mockStorageService: { getPresignedUrl: jest.Mock; upload: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tagihanId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const transaksiId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const bendaharaId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const siswaId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const orangTuaId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const basePendingTagihan = {
    id: tagihanId,
    tenantId,
    siswaId,
    bulan: 9,
    tahun: 2024,
    nominal: 250000,
    totalDibayar: 0,
    status: 'menunggu_verifikasi',
    tanggalJatuhTempo: '2024-09-10',
    alasanPembatalan: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tahunAjaranId: null,
  };

  const basePendingTransaksi = {
    id: transaksiId,
    tenantId,
    tagihanId,
    jumlahBayar: 250000,
    metode: 'upload_bukti',
    status: 'pending',
    buktiTransferUrl: 'bukti-transfer/tenant/tagihan/file.jpg',
    catatan: null,
    alasanPenolakan: null,
    verifiedBy: null,
    verifiedAt: null,
    uploadedBy: orangTuaId,
    nomorReferensi: 'BT-123-ABCDEF01',
    createdAt: new Date(),
  };

  const studentInfo = { id: siswaId, nama: 'Budi Santoso', orangTuaId };

  let selectCallIndex: number;
  let selectResults: any[][];
  let updateCalls: any[];

  const createMockDb = () => {
    selectCallIndex = 0;
    updateCalls = [];

    const makeSelectChain = () => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.innerJoin = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockImplementation(() => {
        // where() returns chainable that supports .limit() or can be awaited directly
        const idx = selectCallIndex;
        selectCallIndex++;
        const result = selectResults[idx] || [];
        // Return a thenable with .limit() support
        const thenable: any = {
          then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
          limit: jest.fn().mockReturnValue(Promise.resolve(result)),
        };
        return thenable;
      });
      chain.limit = jest.fn().mockImplementation(() => {
        const idx = selectCallIndex;
        selectCallIndex++;
        return Promise.resolve(selectResults[idx] || []);
      });
      return chain;
    };

    const updateChain: any = {};
    updateChain.set = jest.fn().mockImplementation((values) => {
      updateCalls.push(values);
      return updateChain;
    });
    updateChain.where = jest.fn().mockResolvedValue(undefined);

    const insertChain: any = {};
    insertChain.values = jest.fn().mockReturnValue(insertChain);
    insertChain.onConflictDoNothing = jest.fn().mockReturnValue(insertChain);
    insertChain.returning = jest.fn().mockResolvedValue([]);

    return {
      select: jest.fn().mockImplementation(() => makeSelectChain()),
      update: jest.fn().mockReturnValue(updateChain),
      insert: jest.fn().mockReturnValue(insertChain),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    mockDb = createMockDb();
    mockNotificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockStorageService = {
      getPresignedUrl: jest.fn().mockResolvedValue('https://presigned-url.example.com/bukti.jpg'),
      upload: jest.fn().mockResolvedValue('path'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: mockStorageService },
        {
          provide: KonfigurasiService,
          useValue: { getConfigByKey: jest.fn().mockResolvedValue({ value: {} }) },
        },
        { provide: RedisService, useValue: { acquireLock: jest.fn(), releaseLock: jest.fn() } },
        { provide: AuditTrailService, useValue: { record: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: mockNotificationQueue },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  describe('Approve payment (Req 12.2, 12.3, 12.7, 12.8)', () => {
    /**
     * Requirement 12.2: Approve when nominal_bayar >= sisa → status becomes lunas.
     */
    it('should approve payment and set status to lunas when total_dibayar >= nominal', async () => {
      // Tagihan with nominal=250000, totalDibayar=0. Transaction pays 250000 (full).
      selectResults = [
        [basePendingTagihan], // find tagihan
        [basePendingTransaksi], // find pending transaction
        [studentInfo], // getStudentInfo
      ];

      const dto: VerifyPaymentDto = { action: 'approve' };
      const result = await service.verifyPayment(tenantId, tagihanId, bendaharaId, dto);

      expect(result.status).toBe('lunas');
      expect(result.total_dibayar).toBe(250000);
      expect(result.sisa_tagihan).toBe(0);
      expect(result.message).toContain('lunas');
    });

    /**
     * Requirement 12.3: Approve when nominal_bayar < sisa → status becomes cicilan.
     */
    it('should approve payment and set status to cicilan when total_dibayar < nominal', async () => {
      // Partial payment: pays 100000 of 250000
      const partialTransaksi = { ...basePendingTransaksi, jumlahBayar: 100000 };
      selectResults = [
        [basePendingTagihan], // find tagihan (totalDibayar=0)
        [partialTransaksi], // find pending transaction (jumlahBayar=100000)
        [studentInfo], // getStudentInfo
      ];

      const dto: VerifyPaymentDto = { action: 'approve' };
      const result = await service.verifyPayment(tenantId, tagihanId, bendaharaId, dto);

      expect(result.status).toBe('cicilan');
      expect(result.total_dibayar).toBe(100000);
      expect(result.sisa_tagihan).toBe(150000);
      expect(result.message).toContain('cicilan');
    });

    /**
     * Requirement 12.7: Notification sent to parent on approve (lunas).
     */
    it('should send notification to parent on approve', async () => {
      selectResults = [[basePendingTagihan], [basePendingTransaksi], [studentInfo]];

      const dto: VerifyPaymentDto = { action: 'approve' };
      await service.verifyPayment(tenantId, tagihanId, bendaharaId, dto);

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-verification-notification',
        expect.objectContaining({
          tenant_id: tenantId,
          orang_tua_id: orangTuaId,
          siswa_id: siswaId,
          siswa_nama: 'Budi Santoso',
          action: 'approved',
          nominal_disetujui: 250000,
          status_baru: 'lunas',
        }),
      );
    });

    /**
     * Requirement 12.8: Notification for cicilan includes sisa_tagihan.
     */
    it('should include sisa_tagihan in notification for cicilan approval', async () => {
      const partialTransaksi = { ...basePendingTransaksi, jumlahBayar: 100000 };
      selectResults = [[basePendingTagihan], [partialTransaksi], [studentInfo]];

      const dto: VerifyPaymentDto = { action: 'approve' };
      await service.verifyPayment(tenantId, tagihanId, bendaharaId, dto);

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-verification-notification',
        expect.objectContaining({
          action: 'approved',
          nominal_disetujui: 100000,
          status_baru: 'cicilan',
          sisa_tagihan: 150000,
        }),
      );
    });
  });

  describe('Reject payment (Req 12.4, 12.5, 12.6)', () => {
    /**
     * Requirement 12.4: Reject must require alasan_penolakan.
     */
    it('should throw BadRequestException when rejecting without alasan_penolakan', async () => {
      selectResults = [[basePendingTagihan], [basePendingTransaksi]];

      const dto: VerifyPaymentDto = { action: 'reject' };

      const err = await service
        .verifyPayment(tenantId, tagihanId, bendaharaId, dto)
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('Alasan penolakan wajib diisi');
    });

    /**
     * Requirement 12.4: Reject sets status to ditolak with alasan.
     */
    it('should reject payment and set status to ditolak with alasan', async () => {
      selectResults = [[basePendingTagihan], [basePendingTransaksi], [studentInfo]];

      const dto: VerifyPaymentDto = {
        action: 'reject',
        alasan_penolakan: 'Bukti transfer tidak jelas',
      };
      const result = await service.verifyPayment(tenantId, tagihanId, bendaharaId, dto);

      expect(result.status).toBe('ditolak');
      expect(result.alasan_penolakan).toBe('Bukti transfer tidak jelas');
    });

    /**
     * Requirement 12.5: Notification with rejection reason sent to parent.
     */
    it('should send notification with rejection reason to parent', async () => {
      selectResults = [[basePendingTagihan], [basePendingTransaksi], [studentInfo]];

      const dto: VerifyPaymentDto = {
        action: 'reject',
        alasan_penolakan: 'Nominal tidak sesuai',
      };
      await service.verifyPayment(tenantId, tagihanId, bendaharaId, dto);

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'send-verification-notification',
        expect.objectContaining({
          tenant_id: tenantId,
          orang_tua_id: orangTuaId,
          action: 'rejected',
          alasan_penolakan: 'Nominal tidak sesuai',
        }),
      );
    });
  });

  describe('Error handling', () => {
    /**
     * Tagihan not found should throw NotFoundException.
     */
    it('should throw NotFoundException when tagihan not found', async () => {
      selectResults = [[]]; // empty result for tagihan lookup

      const dto: VerifyPaymentDto = { action: 'approve' };

      await expect(
        service.verifyPayment(tenantId, 'nonexistent-id', bendaharaId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * Tagihan not in menunggu_verifikasi status should throw BadRequestException.
     */
    it('should throw BadRequestException when tagihan status is not menunggu_verifikasi', async () => {
      const lunasTagihan = { ...basePendingTagihan, status: 'lunas' };
      selectResults = [[lunasTagihan]];

      const dto: VerifyPaymentDto = { action: 'approve' };

      const err = await service
        .verifyPayment(tenantId, tagihanId, bendaharaId, dto)
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('tidak dapat diverifikasi');
    });

    /**
     * No pending transaction should throw NotFoundException.
     */
    it('should throw NotFoundException when no pending transaction exists', async () => {
      selectResults = [
        [basePendingTagihan], // tagihan found
        [], // no pending transaction
      ];

      const dto: VerifyPaymentDto = { action: 'approve' };

      const err = await service
        .verifyPayment(tenantId, tagihanId, bendaharaId, dto)
        .catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.message).toBe('Transaksi pending tidak ditemukan');
    });
  });
});

/**
 * TagihanService Unit Tests — Get Pending Verifications (GET /tagihan/verifikasi)
 *
 * Requirements: 12.1
 */
describe('TagihanService - getPendingVerifications', () => {
  let service: TagihanService;
  let mockStorageService: { getPresignedUrl: jest.Mock; upload: jest.Mock };

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tagihanId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const transaksiId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const siswaId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  let selectCallIndex: number;
  let selectResults: any[][];

  const createMockDb = () => {
    selectCallIndex = 0;

    const makeSelectChain = () => {
      const chain: any = {};
      chain.from = jest.fn().mockReturnValue(chain);
      chain.innerJoin = jest.fn().mockReturnValue(chain);
      chain.where = jest.fn().mockImplementation(() => {
        const idx = selectCallIndex;
        selectCallIndex++;
        const result = selectResults[idx] || [];
        const thenable: any = {
          then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
          limit: jest.fn().mockReturnValue(Promise.resolve(result)),
        };
        return thenable;
      });
      chain.limit = jest.fn().mockImplementation(() => {
        const idx = selectCallIndex;
        selectCallIndex++;
        return Promise.resolve(selectResults[idx] || []);
      });
      return chain;
    };

    return {
      select: jest.fn().mockImplementation(() => makeSelectChain()),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    mockDb = createMockDb();
    mockStorageService = {
      getPresignedUrl: jest.fn().mockResolvedValue('https://presigned-url.example.com/bukti.jpg'),
      upload: jest.fn().mockResolvedValue('path'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: mockStorageService },
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

  /**
   * Requirement 12.1: Return empty when no pending verifications.
   */
  it('should return empty array when no pending verifications', async () => {
    selectResults = [[]]; // no tagihan with menunggu_verifikasi

    const result = await service.getPendingVerifications(tenantId);

    expect(result).toEqual([]);
  });

  /**
   * Requirement 12.1: Return pending verifications with bukti preview URL.
   */
  it('should return pending verifications with presigned bukti URL', async () => {
    const pendingTagihan = [
      {
        id: tagihanId,
        siswaId,
        bulan: 9,
        tahun: 2024,
        nominal: 250000,
        totalDibayar: 0,
        status: 'menunggu_verifikasi',
        createdAt: new Date(),
      },
    ];

    const pendingTransaksi = {
      id: transaksiId,
      tagihanId,
      jumlahBayar: 250000,
      status: 'pending',
      buktiTransferUrl: 'bukti-transfer/tenant/tagihan/file.jpg',
      nomorReferensi: 'BT-123-ABC',
      uploadedBy: 'user-123',
      metode: 'upload_bukti',
      createdAt: new Date(),
    };

    const studentRecord = { nama: 'Budi', kelasId: 'kelas-1' };
    const kelasRecord = { nama: '1A' };
    const uploaderRecord = { nama: 'Orang Tua Budi' };

    selectResults = [
      pendingTagihan, // tagihan query
      [pendingTransaksi], // transaksi for first tagihan
      [studentRecord], // student info for first tagihan
      [kelasRecord], // kelas info
      [uploaderRecord], // uploader info
    ];

    const result = await service.getPendingVerifications(tenantId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(transaksiId);
    expect(result[0].tagihan_id).toBe(tagihanId);
    expect(result[0].siswa_nama).toBe('Budi');
    expect(result[0].kelas_nama).toBe('1A');
    expect(result[0].nominal_tagihan).toBe(250000);
    expect(result[0].jumlah_bayar).toBe(250000);
    expect(result[0].bukti_transfer_url).toBe('https://presigned-url.example.com/bukti.jpg');
    expect(result[0].uploaded_by_nama).toBe('Orang Tua Budi');
    expect(mockStorageService.getPresignedUrl).toHaveBeenCalledWith(
      'bukti-transfer/tenant/tagihan/file.jpg',
      300,
    );
  });

  /**
   * Requirement 12.1: Should handle presigned URL generation failure gracefully.
   */
  it('should return null bukti_transfer_url when presigned URL generation fails', async () => {
    const pendingTagihan = [
      {
        id: tagihanId,
        siswaId,
        bulan: 9,
        tahun: 2024,
        nominal: 250000,
        totalDibayar: 0,
        status: 'menunggu_verifikasi',
        createdAt: new Date(),
      },
    ];

    const pendingTransaksi = {
      id: transaksiId,
      tagihanId,
      jumlahBayar: 250000,
      status: 'pending',
      buktiTransferUrl: 'bukti-transfer/tenant/tagihan/file.jpg',
      nomorReferensi: 'BT-123-ABC',
      uploadedBy: 'user-123',
      metode: 'upload_bukti',
      createdAt: new Date(),
    };

    selectResults = [
      pendingTagihan,
      [pendingTransaksi],
      [{ nama: 'Sari', kelasId: 'kelas-1' }],
      [{ nama: '1A' }],
      [{ nama: 'Orang Tua Sari' }],
    ];

    mockStorageService.getPresignedUrl.mockRejectedValue(new Error('R2 unavailable'));

    const result = await service.getPendingVerifications(tenantId);

    expect(result).toHaveLength(1);
    expect(result[0].bukti_transfer_url).toBeNull();
  });
});
