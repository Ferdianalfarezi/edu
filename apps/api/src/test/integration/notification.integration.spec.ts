/**
 * Integration tests for notification delivery pipeline.
 *
 * Tests the full flow:
 *   Attendance save → queue job → processor → FCM (mocked) → DB record
 *
 * Validates: Requirements 6.1–6.8, 25.1–25.4
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Job } from 'bull';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { FcmService, FcmMessage } from '@/modules/notifikasi/fcm.service';
import {
  BatchAttendanceNotificationProcessor,
  BatchAttendanceJobData,
} from '@/jobs/notification.processor';
import { notifikasi, notifikasiPreferensi, deviceToken } from '@/drizzle/schema/notifikasi';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/edu_test';

describe('Notification Delivery Integration', () => {
  let db: NodePgDatabase;
  let pool: Pool;
  let processor: BatchAttendanceNotificationProcessor;
  let mockFcmService: jest.Mocked<FcmService>;

  // Test data IDs (seeded via raw SQL for determinism)
  let tenantId: string;
  let guruId: string;
  let parentAId: string;
  let parentBId: string;
  let kelasId: string;
  let siswaAId: string;
  let siswaBId: string;
  let siswaCId: string; // second child of parentA
  let tahunAjaranId: string;

  beforeAll(async () => {
    // Real PostgreSQL connection
    pool = new Pool({ connectionString: TEST_DB_URL, max: 5 });
    db = drizzle(pool);

    // Mock FCM service
    mockFcmService = {
      sendBatch: jest.fn(),
      deactivateStaleTokens: jest.fn(),
      onModuleInit: jest.fn(),
    } as any;

    // Build testing module with real DB and mocked FCM
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchAttendanceNotificationProcessor,
        { provide: DRIZZLE, useValue: db },
        { provide: FcmService, useValue: mockFcmService },
      ],
    }).compile();

    processor = module.get<BatchAttendanceNotificationProcessor>(
      BatchAttendanceNotificationProcessor,
    );

    // Seed test data
    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Seed & Cleanup ───────────────────────────────────────────────────────────

  async function seedTestData() {
    const client = await pool.connect();
    try {
      // 1. Tenant
      const tenantRes = await client.query(
        `INSERT INTO "tenant" (nama, alamat, is_active) VALUES ($1, $2, true) RETURNING id`,
        ['Sekolah Notif Integration', 'Jl. Test 1'],
      );
      tenantId = tenantRes.rows[0].id;

      // 2. Users: guru, parentA, parentB
      const guruRes = await client.query(
        `INSERT INTO "user" (tenant_id, nama, email, role, is_active)
         VALUES ($1, $2, $3, 'guru', true) RETURNING id`,
        [tenantId, 'Guru Test', 'guru-notif@test.edu'],
      );
      guruId = guruRes.rows[0].id;

      const parentARes = await client.query(
        `INSERT INTO "user" (tenant_id, nama, phone, role, is_active)
         VALUES (NULL, $1, $2, 'orang_tua', true) RETURNING id`,
        ['Orang Tua A', '081111111111'],
      );
      parentAId = parentARes.rows[0].id;

      const parentBRes = await client.query(
        `INSERT INTO "user" (tenant_id, nama, phone, role, is_active)
         VALUES (NULL, $1, $2, 'orang_tua', true) RETURNING id`,
        ['Orang Tua B', '082222222222'],
      );
      parentBId = parentBRes.rows[0].id;

      // 3. Tahun Ajaran
      const taRes = await client.query(
        `INSERT INTO "tahun_ajaran" (tenant_id, nama, tanggal_mulai, tanggal_selesai, status)
         VALUES ($1, '2024/2025', '2024-07-15', '2025-06-13', 'aktif') RETURNING id`,
        [tenantId],
      );
      tahunAjaranId = taRes.rows[0].id;

      // 4. Kelas
      const kelasRes = await client.query(
        `INSERT INTO "kelas" (tenant_id, tahun_ajaran_id, nama, tingkat)
         VALUES ($1, $2, 'Kelas 1A', 1) RETURNING id`,
        [tenantId, tahunAjaranId],
      );
      kelasId = kelasRes.rows[0].id;

      // 5. Siswa: A→parentA, B→parentB, C→parentA (multiple children)
      const siswaARes = await client.query(
        `INSERT INTO "siswa" (tenant_id, kelas_id, nama, nisn, jenis_kelamin, orang_tua_id, status)
         VALUES ($1, $2, 'Andi', '0000000001', 'L', $3, 'aktif') RETURNING id`,
        [tenantId, kelasId, parentAId],
      );
      siswaAId = siswaARes.rows[0].id;

      const siswaBRes = await client.query(
        `INSERT INTO "siswa" (tenant_id, kelas_id, nama, nisn, jenis_kelamin, orang_tua_id, status)
         VALUES ($1, $2, 'Budi', '0000000002', 'L', $3, 'aktif') RETURNING id`,
        [tenantId, kelasId, parentBId],
      );
      siswaBId = siswaBRes.rows[0].id;

      const siswaCRes = await client.query(
        `INSERT INTO "siswa" (tenant_id, kelas_id, nama, nisn, jenis_kelamin, orang_tua_id, status)
         VALUES ($1, $2, 'Citra', '0000000003', 'P', $3, 'aktif') RETURNING id`,
        [tenantId, kelasId, parentAId],
      );
      siswaCId = siswaCRes.rows[0].id;

      // 6. Device tokens for parents
      await client.query(
        `INSERT INTO "device_token" (user_id, fcm_token, platform, is_active)
         VALUES ($1, 'fcm-token-parentA-android', 'android', true)`,
        [parentAId],
      );
      await client.query(
        `INSERT INTO "device_token" (user_id, fcm_token, platform, is_active)
         VALUES ($1, 'fcm-token-parentB-ios', 'ios', true)`,
        [parentBId],
      );
    } finally {
      client.release();
    }
  }

  async function cleanupTestData() {
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM "notifikasi" WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM "notifikasi_preferensi" WHERE user_id IN ($1, $2)`, [
        parentAId,
        parentBId,
      ]);
      await client.query(`DELETE FROM "device_token" WHERE user_id IN ($1, $2)`, [
        parentAId,
        parentBId,
      ]);
      await client.query(`DELETE FROM "siswa" WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM "kelas" WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM "tahun_ajaran" WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM "user" WHERE id IN ($1, $2, $3)`, [
        guruId,
        parentAId,
        parentBId,
      ]);
      await client.query(`DELETE FROM "tenant" WHERE id = $1`, [tenantId]);
    } finally {
      client.release();
    }
  }

  async function clearNotifications() {
    await pool.query(`DELETE FROM "notifikasi" WHERE tenant_id = $1`, [tenantId]);
  }

  async function clearPreferences() {
    await pool.query(`DELETE FROM "notifikasi_preferensi" WHERE user_id IN ($1, $2)`, [
      parentAId,
      parentBId,
    ]);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function createJob(
    data: BatchAttendanceJobData,
    opts: { attemptsMade?: number } = {},
  ): Job<BatchAttendanceJobData> {
    return {
      id: `integration-job-${Date.now()}`,
      data,
      attemptsMade: opts.attemptsMade ?? 0,
      processedOn: Date.now(),
    } as unknown as Job<BatchAttendanceJobData>;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Attendance save → queue → processor → FCM mock → DB record
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Attendance save → queue → processor → FCM mock → DB record', () => {
    afterEach(async () => {
      await clearNotifications();
    });

    it('should process alpa attendance, call FCM, and create DB notification record', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentA-android', success: true, messageId: 'msg-001' }],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-02',
        waktu_input: '2024-09-02T07:30:00.000Z',
        records: [{ siswa_id: siswaAId, status: 'alpa' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // Assert: FCM was called with correct message
      expect(mockFcmService.sendBatch).toHaveBeenCalledTimes(1);
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages).toHaveLength(1);
      expect(fcmMessages[0].token).toBe('fcm-token-parentA-android');
      expect(fcmMessages[0].notification!.title).toBe('Absensi Andi');
      expect(fcmMessages[0].notification!.body).toContain('alpa');
      expect(fcmMessages[0].notification!.body).toContain('Kelas 1A');
      expect(fcmMessages[0].notification!.body).toContain('Dicatat pada');
      expect(fcmMessages[0].data!.type).toBe('absensi');
      expect(fcmMessages[0].data!.siswa_id).toBe(siswaAId);

      // Assert: DB notification record created
      const records = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.siswaId, siswaAId)));

      expect(records).toHaveLength(1);
      expect(records[0].userId).toBe(parentAId);
      expect(records[0].tipe).toBe('absensi');
      expect(records[0].statusPengiriman).toBe('terkirim');
      expect(records[0].judul).toBe('Absensi Andi');
      expect(records[0].pesan).toContain('alpa');
    });

    it('should process multiple students in one batch job', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          { token: 'fcm-token-parentA-android', success: true, messageId: 'msg-002' },
          { token: 'fcm-token-parentB-ios', success: true, messageId: 'msg-003' },
        ],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-03',
        waktu_input: '2024-09-03T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'izin' },
          { siswa_id: siswaBId, status: 'sakit' },
        ],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // Both parents should receive FCM messages
      expect(mockFcmService.sendBatch).toHaveBeenCalledTimes(1);
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages).toHaveLength(2);

      // DB should have 2 notification records
      const records = await db.select().from(notifikasi).where(eq(notifikasi.tenantId, tenantId));

      expect(records).toHaveLength(2);
      const parentARecord = records.find((r) => r.userId === parentAId);
      const parentBRecord = records.find((r) => r.userId === parentBId);
      expect(parentARecord!.statusPengiriman).toBe('terkirim');
      expect(parentBRecord!.statusPengiriman).toBe('terkirim');
    });

    it('should include waktu_input in notification body for original recording time (Req 6.3)', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentB-ios', success: true, messageId: 'msg-time' }],
      });

      const waktuInput = '2024-09-04T06:45:00.000Z';
      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-04',
        waktu_input: waktuInput,
        records: [{ siswa_id: siswaBId, status: 'alpa' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages[0].notification!.body).toContain(`Dicatat pada ${waktuInput}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Preference filtering (kehadiran ON/OFF)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Preference filtering (kehadiran ON/OFF)', () => {
    afterEach(async () => {
      await clearNotifications();
      await clearPreferences();
    });

    it('should NOT send notification for hadir when kehadiran_enabled=false (default OFF)', async () => {
      // No preference record = defaults: kehadiran OFF, ketidakhadiran ON
      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-05',
        waktu_input: '2024-09-05T07:30:00.000Z',
        records: [{ siswa_id: siswaAId, status: 'hadir' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // FCM should NOT be called
      expect(mockFcmService.sendBatch).not.toHaveBeenCalled();

      // No DB record
      const records = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.siswaId, siswaAId)));
      expect(records).toHaveLength(0);
    });

    it('should SEND notification for hadir when parent opts in (kehadiran_enabled=true)', async () => {
      // Parent A opts in to hadir notifications for siswa A
      await db.insert(notifikasiPreferensi).values({
        userId: parentAId,
        siswaId: siswaAId,
        kehadiranEnabled: true,
        ketidakhadiranEnabled: true,
      });

      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentA-android', success: true, messageId: 'msg-004' }],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-06',
        waktu_input: '2024-09-06T07:30:00.000Z',
        records: [{ siswa_id: siswaAId, status: 'hadir' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      expect(mockFcmService.sendBatch).toHaveBeenCalledTimes(1);
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages[0].notification!.body).toContain('hadir');

      // DB record created
      const records = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.siswaId, siswaAId)));
      expect(records).toHaveLength(1);
      expect(records[0].statusPengiriman).toBe('terkirim');
    });

    it('should NOT send alpa notification when ketidakhadiran_enabled=false', async () => {
      // Parent A explicitly disables ketidakhadiran notifications
      await db.insert(notifikasiPreferensi).values({
        userId: parentAId,
        siswaId: siswaAId,
        kehadiranEnabled: false,
        ketidakhadiranEnabled: false,
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-07',
        waktu_input: '2024-09-07T07:30:00.000Z',
        records: [{ siswa_id: siswaAId, status: 'alpa' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      expect(mockFcmService.sendBatch).not.toHaveBeenCalled();
    });

    it('should send alpa notification by default (ketidakhadiran_enabled defaults to true)', async () => {
      // No preference record → defaults: ketidakhadiran ON
      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentB-ios', success: true, messageId: 'msg-005' }],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-08',
        waktu_input: '2024-09-08T07:30:00.000Z',
        records: [{ siswa_id: siswaBId, status: 'alpa' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      expect(mockFcmService.sendBatch).toHaveBeenCalledTimes(1);
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages[0].token).toBe('fcm-token-parentB-ios');
    });

    it('should respect per-child preferences independently', async () => {
      // Parent A: kehadiran ON for siswaA, OFF for siswaC (default)
      await db.insert(notifikasiPreferensi).values({
        userId: parentAId,
        siswaId: siswaAId,
        kehadiranEnabled: true,
        ketidakhadiranEnabled: true,
      });
      // siswaC has no preference record → defaults apply (kehadiran OFF)

      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentA-android', success: true, messageId: 'msg-006' }],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-09',
        waktu_input: '2024-09-09T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'hadir' }, // → should send (pref enabled)
          { siswa_id: siswaCId, status: 'hadir' }, // → should NOT send (default OFF)
        ],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // Only 1 FCM message (for siswaA)
      expect(mockFcmService.sendBatch).toHaveBeenCalledTimes(1);
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages).toHaveLength(1);
      expect(fcmMessages[0].data!.siswa_id).toBe(siswaAId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Retry on failure
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Retry on failure', () => {
    afterEach(async () => {
      await clearNotifications();
    });

    it('should mark notification as gagal when FCM delivery fails', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 0,
        failureCount: 1,
        results: [
          {
            token: 'fcm-token-parentA-android',
            success: false,
            error: 'Internal server error',
            errorCode: 'messaging/internal-error',
          },
        ],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-10',
        waktu_input: '2024-09-10T07:30:00.000Z',
        records: [{ siswa_id: siswaAId, status: 'alpa' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // DB record created with status gagal
      const records = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.siswaId, siswaAId)));

      expect(records).toHaveLength(1);
      expect(records[0].statusPengiriman).toBe('gagal');
    });

    it('should create gagal records via dead letter handler after max retries (3 attempts)', async () => {
      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-11',
        waktu_input: '2024-09-11T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'alpa' },
          { siswa_id: siswaBId, status: 'sakit' },
        ],
      };

      const job = createJob(jobData, { attemptsMade: 3 });
      const error = new Error('FCM service completely unavailable');

      // Invoke dead letter handler directly (simulates Bull retry exhaustion)
      await (processor as any).handleDeadLetter(job, error);

      // Both parents should have gagal notification records
      const records = await db.select().from(notifikasi).where(eq(notifikasi.tenantId, tenantId));

      expect(records).toHaveLength(2);
      expect(records.every((r) => r.statusPengiriman === 'gagal')).toBe(true);
      expect(records[0].retryCount).toBe(3);

      // Error message captured in data field
      const dataField = records[0].data as Record<string, unknown>;
      expect(dataField.error).toBe('FCM service completely unavailable');
    });

    it('should handle partial FCM failure: some succeed, some fail', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          { token: 'fcm-token-parentA-android', success: true, messageId: 'msg-007' },
          {
            token: 'fcm-token-parentB-ios',
            success: false,
            error: 'Token expired',
            errorCode: 'messaging/registration-token-not-registered',
          },
        ],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-12',
        waktu_input: '2024-09-12T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'izin' },
          { siswa_id: siswaBId, status: 'alpa' },
        ],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      const records = await db.select().from(notifikasi).where(eq(notifikasi.tenantId, tenantId));

      expect(records).toHaveLength(2);

      const parentARecord = records.find((r) => r.userId === parentAId);
      const parentBRecord = records.find((r) => r.userId === parentBId);

      expect(parentARecord!.statusPengiriman).toBe('terkirim');
      expect(parentBRecord!.statusPengiriman).toBe('gagal');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Notification history reflects sent notifications
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Notification history', () => {
    afterEach(async () => {
      await clearNotifications();
    });

    it('should store notification with all required fields for history display', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentA-android', success: true, messageId: 'msg-008' }],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-13',
        waktu_input: '2024-09-13T07:45:00.000Z',
        records: [{ siswa_id: siswaAId, status: 'sakit' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      const records = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.userId, parentAId)));

      expect(records).toHaveLength(1);
      const record = records[0];

      // All history-relevant fields populated (Req 7.1, 7.2)
      expect(record.id).toBeDefined();
      expect(record.tenantId).toBe(tenantId);
      expect(record.userId).toBe(parentAId);
      expect(record.siswaId).toBe(siswaAId);
      expect(record.tipe).toBe('absensi');
      expect(record.judul).toContain('Andi');
      expect(record.pesan).toContain('sakit');
      expect(record.pesan).toContain('Kelas 1A');
      expect(record.pesan).toContain('2024-09-13');
      expect(record.statusPengiriman).toBe('terkirim');
      expect(record.sentAt).toBeDefined();
      expect(record.createdAt).toBeDefined();

      // Data payload for deep-link support (Req 6.6)
      const data = record.data as Record<string, unknown>;
      expect(data.kelas_nama).toBe('Kelas 1A');
      expect(data.tanggal).toBe('2024-09-13');
      expect(data.status).toBe('sakit');
    });

    it('should store delivery status (terkirim/gagal) on each notification (Req 7.2)', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          { token: 'fcm-token-parentA-android', success: true, messageId: 'msg-009' },
          { token: 'fcm-token-parentB-ios', success: false, error: 'timeout' },
        ],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-14',
        waktu_input: '2024-09-14T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'alpa' },
          { siswa_id: siswaBId, status: 'izin' },
        ],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      const records = await db.select().from(notifikasi).where(eq(notifikasi.tenantId, tenantId));

      expect(records).toHaveLength(2);
      const statuses = records.map((r) => r.statusPengiriman).sort();
      expect(statuses).toEqual(['gagal', 'terkirim']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Multiple children → correct parent receives for correct child
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Multiple children → correct parent notification routing', () => {
    afterEach(async () => {
      await clearNotifications();
    });

    it('should send separate notifications per child to same parent (Req 6.8)', async () => {
      // parentA has 2 children: siswaA and siswaC
      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          { token: 'fcm-token-parentA-android', success: true, messageId: 'msg-010' },
          { token: 'fcm-token-parentA-android', success: true, messageId: 'msg-011' },
        ],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-15',
        waktu_input: '2024-09-15T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'alpa' },
          { siswa_id: siswaCId, status: 'izin' },
        ],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // FCM should send 2 messages (both to parentA's device)
      expect(mockFcmService.sendBatch).toHaveBeenCalledTimes(1);
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages).toHaveLength(2);
      expect(fcmMessages.every((m) => m.token === 'fcm-token-parentA-android')).toBe(true);

      // Messages are for different children
      const siswaIds = fcmMessages.map((m) => m.data!.siswa_id);
      expect(siswaIds).toContain(siswaAId);
      expect(siswaIds).toContain(siswaCId);

      // DB: 2 separate notification records (one per child)
      const records = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.userId, parentAId)));

      expect(records).toHaveLength(2);
      const recordSiswaIds = records.map((r) => r.siswaId);
      expect(recordSiswaIds).toContain(siswaAId);
      expect(recordSiswaIds).toContain(siswaCId);
    });

    it('should route notification to correct parent for each child', async () => {
      mockFcmService.sendBatch.mockResolvedValue({
        total: 2,
        successCount: 2,
        failureCount: 0,
        results: [
          { token: 'fcm-token-parentA-android', success: true, messageId: 'msg-012' },
          { token: 'fcm-token-parentB-ios', success: true, messageId: 'msg-013' },
        ],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-16',
        waktu_input: '2024-09-16T07:30:00.000Z',
        records: [
          { siswa_id: siswaAId, status: 'alpa' }, // → parentA
          { siswa_id: siswaBId, status: 'izin' }, // → parentB
        ],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // Verify FCM routing
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      const msgForSiswaA = fcmMessages.find((m) => m.data!.siswa_id === siswaAId);
      const msgForSiswaB = fcmMessages.find((m) => m.data!.siswa_id === siswaBId);

      expect(msgForSiswaA!.token).toBe('fcm-token-parentA-android');
      expect(msgForSiswaB!.token).toBe('fcm-token-parentB-ios');

      // Verify DB records
      const records = await db.select().from(notifikasi).where(eq(notifikasi.tenantId, tenantId));

      expect(records).toHaveLength(2);
      const recordForA = records.find((r) => r.siswaId === siswaAId);
      const recordForB = records.find((r) => r.siswaId === siswaBId);

      expect(recordForA!.userId).toBe(parentAId);
      expect(recordForB!.userId).toBe(parentBId);
    });

    it('should not send notification to parentB for parentA child', async () => {
      // Only siswaC (child of parentA) is alpa
      mockFcmService.sendBatch.mockResolvedValue({
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ token: 'fcm-token-parentA-android', success: true, messageId: 'msg-014' }],
      });

      const jobData: BatchAttendanceJobData = {
        tenant_id: tenantId,
        kelas_id: kelasId,
        kelas_nama: 'Kelas 1A',
        tanggal: '2024-09-17',
        waktu_input: '2024-09-17T07:30:00.000Z',
        records: [{ siswa_id: siswaCId, status: 'alpa' }],
      };

      await processor.handleBatchAttendanceNotification(createJob(jobData));

      // Only parentA should receive
      const fcmMessages: FcmMessage[] = mockFcmService.sendBatch.mock.calls[0][0];
      expect(fcmMessages).toHaveLength(1);
      expect(fcmMessages[0].token).toBe('fcm-token-parentA-android');
      expect(fcmMessages[0].notification!.title).toBe('Absensi Citra');

      // No notification record for parentB
      const parentBRecords = await db
        .select()
        .from(notifikasi)
        .where(and(eq(notifikasi.tenantId, tenantId), eq(notifikasi.userId, parentBId)));
      expect(parentBRecords).toHaveLength(0);
    });
  });
});
