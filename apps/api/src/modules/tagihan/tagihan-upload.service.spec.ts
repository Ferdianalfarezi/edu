import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { TagihanService } from './tagihan.service';
import { AuditTrailService } from './audit-trail.service';
import { DrizzleService } from '@/drizzle/drizzle.service';
import { StorageService } from '@/modules/storage/storage.service';
import { KonfigurasiService } from '@/modules/konfigurasi/konfigurasi.service';
import { RedisService } from '@/modules/redis/redis.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { UploadBuktiDto } from './dto';

/**
 * TagihanService Unit Tests — Upload Bukti Transfer (POST /tagihan/:id/upload-bukti)
 *
 * Requirements: 11.1–11.17
 */
describe('TagihanService - uploadBuktiTransfer', () => {
  let service: TagihanService;
  let mockStorageService: { upload: jest.Mock };
  let mockImageQueue: { add: jest.Mock };

  const userId = '11111111-1111-1111-1111-111111111111';
  const tenantId = '22222222-2222-2222-2222-222222222222';
  const tagihanId = '33333333-3333-3333-3333-333333333333';
  const siswaId = '44444444-4444-4444-4444-444444444444';

  const baseTagihan = {
    id: tagihanId,
    tenantId,
    siswaId,
    bulan: 1,
    tahun: 2024,
    nominal: 500000,
    totalDibayar: 0,
    status: 'belum_bayar' as const,
    tanggalJatuhTempo: '2024-01-31',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseSiswa = {
    id: siswaId,
    nama: 'Budi',
    orangTuaId: userId,
  };

  const validFile = {
    buffer: Buffer.from('fake-image-data'),
    mimetype: 'image/jpeg',
    originalname: 'bukti.jpg',
    size: 1024 * 100, // 100KB
  };

  const validDto: UploadBuktiDto = { nominal_bayar: 500000 };

  // Track DB mock behavior
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
    selectChain.where = jest.fn().mockImplementation((condition: any) => {
      // If limit() was not called, resolve immediately
      const chain: any = {
        limit: jest.fn().mockImplementation(() => {
          const result = selectResults[selectCallIndex] || [];
          selectCallIndex++;
          return Promise.resolve(result);
        }),
      };
      // If called without .limit(), return results directly (for the approved transactions query)
      chain.then = (resolve: any) => {
        const result = selectResults[selectCallIndex] || [];
        selectCallIndex++;
        return Promise.resolve(result).then(resolve);
      };
      chain.catch = (reject: any) => Promise.resolve([]).catch(reject);
      chain[Symbol.iterator] = undefined;
      return chain;
    });

    const insertChain: any = {};
    insertChain.values = jest.fn().mockReturnValue(insertChain);
    insertChain.returning = jest.fn().mockImplementation(() => Promise.resolve(insertResult));

    const updateChain: any = {};
    updateChain.set = jest.fn().mockReturnValue(updateChain);
    updateChain.where = jest.fn().mockResolvedValue(undefined);

    return {
      select: jest.fn().mockReturnValue(selectChain),
      insert: jest.fn().mockReturnValue(insertChain),
      update: jest.fn().mockReturnValue(updateChain),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    selectResults = [];
    insertResult = [];
    mockDb = createMockDb();
    mockStorageService = { upload: jest.fn().mockResolvedValue('some/path.jpg') };
    mockImageQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagihanService,
        { provide: DrizzleService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: mockStorageService },
        { provide: KonfigurasiService, useValue: { getConfigByKey: jest.fn() } },
        { provide: RedisService, useValue: { acquireLock: jest.fn(), releaseLock: jest.fn() } },
        { provide: AuditTrailService, useValue: { record: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: mockImageQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATION), useValue: { add: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<TagihanService>(TagihanService);
  });

  /**
   * Requirement 11.1: Tagihan must exist.
   */
  it('should throw NotFoundException when tagihan does not exist', async () => {
    selectResults = [[]]; // tagihan not found

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile),
    ).rejects.toThrow(NotFoundException);
  });

  /**
   * Requirement 11.1: Tagihan must belong to parent's child.
   */
  it('should throw ForbiddenException when tagihan does not belong to parent child', async () => {
    selectResults = [
      [baseTagihan], // tagihan found
      [], // siswa NOT owned by this parent
    ];

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile),
    ).rejects.toThrow(ForbiddenException);
  });

  /**
   * Requirement 11.8: Block upload when status is menunggu_verifikasi.
   */
  it('should throw BadRequestException when status is menunggu_verifikasi', async () => {
    selectResults = [[{ ...baseTagihan, status: 'menunggu_verifikasi' }], [baseSiswa]];

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile),
    ).rejects.toThrow(BadRequestException);

    try {
      selectCallIndex = 0;
      selectResults = [[{ ...baseTagihan, status: 'menunggu_verifikasi' }], [baseSiswa]];
      await service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile);
    } catch (err: any) {
      expect(err.message).toContain('menunggu verifikasi');
    }
  });

  /**
   * Requirement 11.5: File format must be JPG/JPEG/PNG.
   */
  it('should throw BadRequestException for invalid file format (PDF)', async () => {
    selectResults = [[baseTagihan], [baseSiswa]];

    const pdfFile = { ...validFile, mimetype: 'application/pdf', originalname: 'doc.pdf' };

    await expect(service.uploadBuktiTransfer(userId, tagihanId, validDto, pdfFile)).rejects.toThrow(
      BadRequestException,
    );

    try {
      selectCallIndex = 0;
      selectResults = [[baseTagihan], [baseSiswa]];
      await service.uploadBuktiTransfer(userId, tagihanId, validDto, pdfFile);
    } catch (err: any) {
      expect(err.message).toContain('Format file tidak didukung');
    }
  });

  /**
   * Requirement 11.5: File size must not exceed 5MB.
   */
  it('should throw BadRequestException when file exceeds 5MB', async () => {
    selectResults = [[baseTagihan], [baseSiswa]];

    const largeFile = { ...validFile, size: 6 * 1024 * 1024 }; // 6MB

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, validDto, largeFile),
    ).rejects.toThrow(BadRequestException);

    try {
      selectCallIndex = 0;
      selectResults = [[baseTagihan], [baseSiswa]];
      await service.uploadBuktiTransfer(userId, tagihanId, validDto, largeFile);
    } catch (err: any) {
      expect(err.message).toContain('5MB');
    }
  });

  /**
   * Requirement 11.9, 11.11: nominal_bayar must be >= 10000.
   */
  it('should throw BadRequestException when nominal_bayar is less than 10000', async () => {
    selectResults = [[baseTagihan], [baseSiswa]];

    const lowNominalDto: UploadBuktiDto = { nominal_bayar: 5000 };

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, lowNominalDto, validFile),
    ).rejects.toThrow(BadRequestException);

    try {
      selectCallIndex = 0;
      selectResults = [[baseTagihan], [baseSiswa]];
      await service.uploadBuktiTransfer(userId, tagihanId, lowNominalDto, validFile);
    } catch (err: any) {
      expect(err.message).toContain('Nominal pembayaran minimal Rp 10.000');
    }
  });

  /**
   * Requirement 11.10, 11.12: nominal_bayar must not exceed sisa tagihan.
   */
  it('should throw BadRequestException when nominal_bayar exceeds sisa tagihan', async () => {
    selectResults = [
      [{ ...baseTagihan, totalDibayar: 400000 }], // sisa = 100000
      [baseSiswa],
    ];

    const excessDto: UploadBuktiDto = { nominal_bayar: 200000 };

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, excessDto, validFile),
    ).rejects.toThrow(BadRequestException);

    try {
      selectCallIndex = 0;
      selectResults = [[{ ...baseTagihan, totalDibayar: 400000 }], [baseSiswa]];
      await service.uploadBuktiTransfer(userId, tagihanId, excessDto, validFile);
    } catch (err: any) {
      expect(err.message).toContain('Nominal melebihi sisa tagihan');
    }
  });

  /**
   * Requirement 11.13: Max 2 cicilan via upload.
   */
  it('should throw BadRequestException when already has 2 approved upload transactions', async () => {
    selectResults = [
      [baseTagihan],
      [baseSiswa],
      // 2 existing approved transactions
      [{ id: 'tx-1' }, { id: 'tx-2' }],
    ];

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile),
    ).rejects.toThrow(BadRequestException);

    try {
      selectCallIndex = 0;
      selectResults = [[baseTagihan], [baseSiswa], [{ id: 'tx-1' }, { id: 'tx-2' }]];
      await service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile);
    } catch (err: any) {
      expect(err.message).toContain('Maksimal 2 kali pembayaran');
    }
  });

  /**
   * Requirement 11.14: Second cicilan must equal remaining balance exactly.
   */
  it('should throw BadRequestException when second payment does not equal remaining balance', async () => {
    // Total 500000, already paid 300000, sisa = 200000
    selectResults = [
      [{ ...baseTagihan, totalDibayar: 300000, status: 'cicilan' }],
      [baseSiswa],
      [{ id: 'tx-1' }], // 1 approved transaction exists
    ];

    const partialDto: UploadBuktiDto = { nominal_bayar: 100000 }; // not equal to sisa 200000

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, partialDto, validFile),
    ).rejects.toThrow(BadRequestException);

    try {
      selectCallIndex = 0;
      selectResults = [
        [{ ...baseTagihan, totalDibayar: 300000, status: 'cicilan' }],
        [baseSiswa],
        [{ id: 'tx-1' }],
      ];
      await service.uploadBuktiTransfer(userId, tagihanId, partialDto, validFile);
    } catch (err: any) {
      expect(err.message).toContain('wajib melunasi seluruh sisa tagihan');
    }
  });

  /**
   * Requirement 11.4, 11.7, 11.15: Successful upload creates transaction,
   * changes status, and enqueues compression job.
   */
  it('should successfully upload bukti, create transaksi, update status, and enqueue compression', async () => {
    const transaksiId = '55555555-5555-5555-5555-555555555555';

    selectResults = [
      [baseTagihan], // tagihan found
      [baseSiswa], // siswa belongs to parent
      [], // no existing approved transactions
    ];
    insertResult = [
      {
        id: transaksiId,
        tagihanId,
        jumlahBayar: 500000,
        metode: 'upload_bukti',
        status: 'pending',
        buktiTransferUrl: 'some/path.jpg',
        nomorReferensi: 'BT-123-ABCDEFGH',
      },
    ];

    const result = await service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile);

    // Verify response
    expect(result.message).toContain('menunggu verifikasi');
    expect(result.transaksi_id).toBe(transaksiId);
    expect(result.nominal_bayar).toBe(500000);
    expect(result.sisa_tagihan).toBe(0);
    expect(result.nomor_referensi).toBeDefined();

    // Verify storage upload was called (inline with timeout)
    expect(mockStorageService.upload).toHaveBeenCalledTimes(1);
    expect(mockStorageService.upload).toHaveBeenCalledWith(
      expect.stringContaining('bukti-transfer/'),
      validFile.buffer,
      'image/jpeg',
    );

    // Verify image compression job enqueued
    expect(mockImageQueue.add).toHaveBeenCalledTimes(1);
    expect(mockImageQueue.add).toHaveBeenCalledWith(
      'compress-bukti-transfer',
      expect.objectContaining({
        transaksi_id: transaksiId,
        tenant_id: tenantId,
        tagihan_id: tagihanId,
      }),
      expect.objectContaining({ attempts: 3 }),
    );

    // Verify DB operations
    expect(mockDb.insert).toHaveBeenCalledTimes(1); // tagihan_transaksi
    expect(mockDb.update).toHaveBeenCalledTimes(1); // tagihan status update
  });

  /**
   * Requirement 11.1: Allowed statuses for upload are belum_bayar, ditolak, cicilan.
   */
  it('should allow upload when status is ditolak', async () => {
    const transaksiId = '66666666-6666-6666-6666-666666666666';

    selectResults = [
      [{ ...baseTagihan, status: 'ditolak' }],
      [baseSiswa],
      [], // no approved transactions
    ];
    insertResult = [
      {
        id: transaksiId,
        tagihanId,
        jumlahBayar: 500000,
        metode: 'upload_bukti',
        status: 'pending',
      },
    ];

    const result = await service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile);

    expect(result.message).toContain('menunggu verifikasi');
  });

  /**
   * Requirement 11.1: Allow upload when status is cicilan.
   * Requirement 11.14: Second payment equals sisa exactly.
   */
  it('should allow second upload when nominal equals remaining balance exactly', async () => {
    const transaksiId = '77777777-7777-7777-7777-777777777777';
    // Total 500000, already paid 300000, sisa = 200000
    selectResults = [
      [{ ...baseTagihan, totalDibayar: 300000, status: 'cicilan' }],
      [baseSiswa],
      [{ id: 'tx-1' }], // 1 approved transaction
    ];
    insertResult = [
      {
        id: transaksiId,
        tagihanId,
        jumlahBayar: 200000,
        metode: 'upload_bukti',
        status: 'pending',
      },
    ];

    const exactDto: UploadBuktiDto = { nominal_bayar: 200000 };
    const result = await service.uploadBuktiTransfer(userId, tagihanId, exactDto, validFile);

    expect(result.message).toContain('menunggu verifikasi');
    expect(result.nominal_bayar).toBe(200000);
    expect(result.sisa_tagihan).toBe(0);
  });

  /**
   * Requirement 11.5: PNG should be an accepted format.
   */
  it('should accept PNG file format', async () => {
    const transaksiId = '88888888-8888-8888-8888-888888888888';
    selectResults = [[baseTagihan], [baseSiswa], []];
    insertResult = [
      {
        id: transaksiId,
        tagihanId,
        jumlahBayar: 500000,
        metode: 'upload_bukti',
        status: 'pending',
      },
    ];

    const pngFile = { ...validFile, mimetype: 'image/png', originalname: 'bukti.png' };
    const result = await service.uploadBuktiTransfer(userId, tagihanId, validDto, pngFile);

    expect(result.message).toContain('menunggu verifikasi');
    expect(mockStorageService.upload).toHaveBeenCalledWith(
      expect.stringContaining('.png'),
      pngFile.buffer,
      'image/png',
    );
  });

  /**
   * Requirement 11.4: Status must change to menunggu_verifikasi.
   * Block upload for lunas status.
   */
  it('should throw BadRequestException when status is lunas', async () => {
    selectResults = [[{ ...baseTagihan, status: 'lunas' }], [baseSiswa]];

    await expect(
      service.uploadBuktiTransfer(userId, tagihanId, validDto, validFile),
    ).rejects.toThrow(BadRequestException);
  });
});
