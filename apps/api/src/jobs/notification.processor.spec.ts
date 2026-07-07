import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { FcmService, FcmBatchResult } from '@/modules/notifikasi/fcm.service';
import {
  BatchAttendanceNotificationProcessor,
  BatchAttendanceJobData,
} from './notification.processor';

describe('BatchAttendanceNotificationProcessor', () => {
  let processor: BatchAttendanceNotificationProcessor;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
  };
  let mockFcmService: { sendBatch: jest.Mock };

  // Helpers for chainable mock query builders
  const createSelectChain = (data: any[]) => {
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(data),
    };
    return chain;
  };

  const createInsertChain = () => {
    const chain = {
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };
    return chain;
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
    };

    mockFcmService = {
      sendBatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchAttendanceNotificationProcessor,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: FcmService, useValue: mockFcmService },
      ],
    }).compile();

    processor = module.get<BatchAttendanceNotificationProcessor>(
      BatchAttendanceNotificationProcessor,
    );
  });

  const createJob = (data: Partial<BatchAttendanceJobData> = {}): Job<BatchAttendanceJobData> =>
    ({
      id: 'test-job-1',
      data: {
        tenant_id: 'tenant-1',
        kelas_id: 'kelas-1',
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-01-15',
        waktu_input: '2024-01-15T07:30:00.000Z',
        records: [
          { siswa_id: 'siswa-1', status: 'alpa' },
          { siswa_id: 'siswa-2', status: 'hadir' },
        ],
        ...data,
      },
      attemptsMade: 0,
    }) as unknown as Job<BatchAttendanceJobData>;

  describe('handleBatchAttendanceNotification', () => {
    it('should skip processing if records are empty', async () => {
      const job = createJob({ records: [] });

      await processor.handleBatchAttendanceNotification(job);

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockFcmService.sendBatch).not.toHaveBeenCalled();
    });

    it('should skip if no parents found for students', async () => {
      const job = createJob();

      // Students without parents
      const selectChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: null },
        { id: 'siswa-2', nama: 'Budi', orangTuaId: null },
      ]);
      mockDb.select.mockReturnValue(selectChain);

      await processor.handleBatchAttendanceNotification(job);

      expect(mockFcmService.sendBatch).not.toHaveBeenCalled();
    });

    it('should filter by preferences: send non-hadir by default, skip hadir', async () => {
      const job = createJob({
        records: [
          { siswa_id: 'siswa-1', status: 'alpa' },
          { siswa_id: 'siswa-2', status: 'hadir' },
        ],
      });

      // Call 1: students
      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: 'parent-1' },
        { id: 'siswa-2', nama: 'Budi', orangTuaId: 'parent-2' },
      ]);
      // Call 2: preferences (no records = use defaults)
      const prefsChain = createSelectChain([]);
      // Call 3: device tokens
      const tokensChain = createSelectChain([
        { userId: 'parent-1', fcmToken: 'token-parent-1' },
        { userId: 'parent-2', fcmToken: 'token-parent-2' },
      ]);

      mockDb.select
        .mockReturnValueOnce(studentsChain)
        .mockReturnValueOnce(prefsChain)
        .mockReturnValueOnce(tokensChain);

      const insertChain = createInsertChain();
      mockDb.insert.mockReturnValue(insertChain);

      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'token-parent-1', success: true, messageId: 'msg-1' }],
      } as FcmBatchResult);

      await processor.handleBatchAttendanceNotification(job);

      // Only parent-1 should get notification (alpa → ketidakhadiran_enabled defaults to true)
      // parent-2 (hadir) should NOT (kehadiran_enabled defaults to false)
      expect(mockFcmService.sendBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          token: 'token-parent-1',
          notification: expect.objectContaining({
            title: 'Absensi Andi',
            body: expect.stringContaining('alpa'),
          }),
        }),
      ]);
    });

    it('should send hadir notification when preference is enabled', async () => {
      const job = createJob({
        records: [{ siswa_id: 'siswa-1', status: 'hadir' }],
      });

      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: 'parent-1' },
      ]);
      // Preference: kehadiran_enabled = true
      const prefsChain = createSelectChain([
        {
          userId: 'parent-1',
          siswaId: 'siswa-1',
          kehadiranEnabled: true,
          ketidakhadiranEnabled: true,
        },
      ]);
      const tokensChain = createSelectChain([{ userId: 'parent-1', fcmToken: 'token-p1' }]);

      mockDb.select
        .mockReturnValueOnce(studentsChain)
        .mockReturnValueOnce(prefsChain)
        .mockReturnValueOnce(tokensChain);

      const insertChain = createInsertChain();
      mockDb.insert.mockReturnValue(insertChain);

      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'token-p1', success: true, messageId: 'msg-1' }],
      } as FcmBatchResult);

      await processor.handleBatchAttendanceNotification(job);

      expect(mockFcmService.sendBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          token: 'token-p1',
          notification: expect.objectContaining({
            title: 'Absensi Andi',
            body: expect.stringContaining('hadir'),
          }),
        }),
      ]);
    });

    it('should build correct FCM message format with data payload', async () => {
      const job = createJob({
        tenant_id: 'tenant-abc',
        kelas_nama: 'Kelas 3B',
        tanggal: '2024-03-20',
        waktu_input: '2024-03-20T08:00:00.000Z',
        records: [{ siswa_id: 'siswa-1', status: 'sakit' }],
      });

      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Citra', orangTuaId: 'parent-1' },
      ]);
      const prefsChain = createSelectChain([]);
      const tokensChain = createSelectChain([
        { userId: 'parent-1', fcmToken: 'token-citra-parent' },
      ]);

      mockDb.select
        .mockReturnValueOnce(studentsChain)
        .mockReturnValueOnce(prefsChain)
        .mockReturnValueOnce(tokensChain);

      const insertChain = createInsertChain();
      mockDb.insert.mockReturnValue(insertChain);

      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'token-citra-parent', success: true, messageId: 'msg-1' }],
      } as FcmBatchResult);

      await processor.handleBatchAttendanceNotification(job);

      expect(mockFcmService.sendBatch).toHaveBeenCalledWith([
        {
          token: 'token-citra-parent',
          notification: {
            title: 'Absensi Citra',
            body: 'Status: sakit — Kelas 3B, 2024-03-20. Dicatat pada 2024-03-20T08:00:00.000Z',
          },
          data: {
            type: 'absensi',
            siswa_id: 'siswa-1',
            tenant_id: 'tenant-abc',
          },
        },
      ]);
    });

    it('should batch INSERT notification records with correct status_pengiriman', async () => {
      const job = createJob({
        records: [
          { siswa_id: 'siswa-1', status: 'alpa' },
          { siswa_id: 'siswa-2', status: 'izin' },
        ],
      });

      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: 'parent-1' },
        { id: 'siswa-2', nama: 'Budi', orangTuaId: 'parent-2' },
      ]);
      const prefsChain = createSelectChain([]);
      const tokensChain = createSelectChain([
        { userId: 'parent-1', fcmToken: 'token-p1' },
        { userId: 'parent-2', fcmToken: 'token-p2' },
      ]);

      mockDb.select
        .mockReturnValueOnce(studentsChain)
        .mockReturnValueOnce(prefsChain)
        .mockReturnValueOnce(tokensChain);

      const insertChain = createInsertChain();
      mockDb.insert.mockReturnValue(insertChain);

      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          { token: 'token-p1', success: true, messageId: 'msg-1' },
          {
            token: 'token-p2',
            success: false,
            error: 'Timeout',
            errorCode: 'messaging/internal-error',
          },
        ],
      } as FcmBatchResult);

      await processor.handleBatchAttendanceNotification(job);

      expect(mockDb.insert).toHaveBeenCalled();
      const insertedValues = insertChain.values.mock.calls[0][0];

      expect(insertedValues).toHaveLength(2);

      const record1 = insertedValues.find((r: any) => r.userId === 'parent-1');
      const record2 = insertedValues.find((r: any) => r.userId === 'parent-2');

      expect(record1.statusPengiriman).toBe('terkirim');
      expect(record2.statusPengiriman).toBe('gagal');
      expect(record1.tipe).toBe('absensi');
      expect(record1.siswaId).toBe('siswa-1');
      expect(record2.siswaId).toBe('siswa-2');
    });

    it('should handle parent with multiple device tokens (send to all)', async () => {
      const job = createJob({
        records: [{ siswa_id: 'siswa-1', status: 'izin' }],
      });

      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: 'parent-1' },
      ]);
      const prefsChain = createSelectChain([]);
      // Parent has 2 devices
      const tokensChain = createSelectChain([
        { userId: 'parent-1', fcmToken: 'token-android' },
        { userId: 'parent-1', fcmToken: 'token-ios' },
      ]);

      mockDb.select
        .mockReturnValueOnce(studentsChain)
        .mockReturnValueOnce(prefsChain)
        .mockReturnValueOnce(tokensChain);

      const insertChain = createInsertChain();
      mockDb.insert.mockReturnValue(insertChain);

      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          { token: 'token-android', success: true, messageId: 'msg-1' },
          { token: 'token-ios', success: true, messageId: 'msg-2' },
        ],
      } as FcmBatchResult);

      await processor.handleBatchAttendanceNotification(job);

      // FCM should be called with both tokens
      expect(mockFcmService.sendBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ token: 'token-android' }),
          expect.objectContaining({ token: 'token-ios' }),
        ]),
      );

      // But only ONE notification record should be created per parent+student
      const insertedValues = insertChain.values.mock.calls[0][0];
      expect(insertedValues).toHaveLength(1);
      expect(insertedValues[0].userId).toBe('parent-1');
      expect(insertedValues[0].statusPengiriman).toBe('terkirim');
    });

    it('should skip notification if parent has ketidakhadiran_enabled=false', async () => {
      const job = createJob({
        records: [{ siswa_id: 'siswa-1', status: 'alpa' }],
      });

      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: 'parent-1' },
      ]);
      // Explicit preference: ketidakhadiran disabled
      const prefsChain = createSelectChain([
        {
          userId: 'parent-1',
          siswaId: 'siswa-1',
          kehadiranEnabled: false,
          ketidakhadiranEnabled: false,
        },
      ]);
      const tokensChain = createSelectChain([{ userId: 'parent-1', fcmToken: 'token-p1' }]);

      mockDb.select
        .mockReturnValueOnce(studentsChain)
        .mockReturnValueOnce(prefsChain)
        .mockReturnValueOnce(tokensChain);

      await processor.handleBatchAttendanceNotification(job);

      expect(mockFcmService.sendBatch).not.toHaveBeenCalled();
    });
  });

  describe('handleDeadLetter', () => {
    it('should create gagal notification records when retries exhausted', async () => {
      const job = createJob({
        records: [
          { siswa_id: 'siswa-1', status: 'alpa' },
          { siswa_id: 'siswa-2', status: 'sakit' },
        ],
      });
      (job as any).attemptsMade = 3;

      const studentsChain = createSelectChain([
        { id: 'siswa-1', nama: 'Andi', orangTuaId: 'parent-1' },
        { id: 'siswa-2', nama: 'Budi', orangTuaId: 'parent-2' },
      ]);
      mockDb.select.mockReturnValue(studentsChain);

      const insertChain = createInsertChain();
      mockDb.insert.mockReturnValue(insertChain);

      const error = new Error('FCM service unavailable');

      // Access the protected method via type assertion
      await (processor as any).handleDeadLetter(job, error);

      expect(mockDb.insert).toHaveBeenCalled();
      const insertedValues = insertChain.values.mock.calls[0][0];

      expect(insertedValues).toHaveLength(2);
      expect(insertedValues[0].statusPengiriman).toBe('gagal');
      expect(insertedValues[1].statusPengiriman).toBe('gagal');
      expect(insertedValues[0].retryCount).toBe(3);
      expect(insertedValues[0].data).toEqual(
        expect.objectContaining({ error: 'FCM service unavailable' }),
      );
    });
  });
});
