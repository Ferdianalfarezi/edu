import { Inject, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { eq, inArray, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { siswa } from '@/drizzle/schema/siswa';
import { notifikasiPreferensi, deviceToken, notifikasi } from '@/drizzle/schema/notifikasi';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { FcmService, FcmMessage } from '@/modules/notifikasi/fcm.service';
import { BaseProcessor } from './base.processor';

/**
 * Job payload for batch attendance notification.
 * ONE job per class (not per student), enqueued by AbsensiService.
 */
export interface BatchAttendanceJobData {
  tenant_id: string;
  kelas_id: string;
  kelas_nama: string;
  tanggal: string;
  waktu_input: string;
  records: Array<{
    siswa_id: string;
    status: 'hadir' | 'izin' | 'sakit' | 'alpa';
  }>;
}

/**
 * Internal resolved notification target after preference/token resolution.
 */
interface NotificationTarget {
  user_id: string;
  siswa_id: string;
  siswa_nama: string;
  status: string;
  fcm_token: string;
}

/**
 * BatchAttendanceNotificationProcessor processes attendance notifications
 * using a batch approach: ONE job per class submission.
 *
 * Processing steps:
 * 1. Resolve students → parents (siswa.orang_tua_id)
 * 2. Batch query parent preferences (notifikasi_preferensi)
 * 3. Batch query parent device tokens (active only)
 * 4. Filter by preference: hadir → kehadiran_enabled; non-hadir → ketidakhadiran_enabled
 * 5. Build FCM messages and send via FcmService.sendBatch (handles 500-chunking)
 * 6. Batch INSERT notification records
 * 7. Update status_pengiriman based on FCM results
 *
 * Retry: max 3 attempts, 60s interval. After exhaustion → mark as gagal.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.7
 */
@Processor(QUEUE_NAMES.NOTIFICATION)
export class BatchAttendanceNotificationProcessor extends BaseProcessor {
  private readonly processorLogger = new Logger(BatchAttendanceNotificationProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly fcmService: FcmService,
  ) {
    super('BatchAttendanceNotificationProcessor', { concurrency: 10, maxAttempts: 3 });
  }

  @Process({
    name: 'send-batch-attendance-notification',
    concurrency: 10,
  })
  async handleBatchAttendanceNotification(job: Job<BatchAttendanceJobData>): Promise<void> {
    const { tenant_id, kelas_nama, tanggal, waktu_input, records } = job.data;

    if (!records || records.length === 0) {
      this.processorLogger.warn(`Job ${job.id}: empty records, skipping`);
      return;
    }

    // Step 1: Resolve students → get parent IDs and student names
    const siswaIds = records.map((r) => r.siswa_id);
    const students = await this.db
      .select({
        id: siswa.id,
        nama: siswa.nama,
        orangTuaId: siswa.orangTuaId,
      })
      .from(siswa)
      .where(inArray(siswa.id, siswaIds));

    // Build siswa lookup maps
    const siswaMap = new Map(students.map((s) => [s.id, s]));
    const parentIds = [...new Set(students.filter((s) => s.orangTuaId).map((s) => s.orangTuaId!))];

    if (parentIds.length === 0) {
      this.processorLogger.log(`Job ${job.id}: no parents found for students, skipping`);
      return;
    }

    // Step 2: Batch query parent preferences
    const preferences = await this.db
      .select()
      .from(notifikasiPreferensi)
      .where(inArray(notifikasiPreferensi.userId, parentIds));

    // Build preference lookup: key = "userId:siswaId"
    const prefMap = new Map(preferences.map((p) => [`${p.userId}:${p.siswaId}`, p]));

    // Step 3: Batch query active device tokens for parents
    const tokens = await this.db
      .select({
        userId: deviceToken.userId,
        fcmToken: deviceToken.fcmToken,
      })
      .from(deviceToken)
      .where(and(inArray(deviceToken.userId, parentIds), eq(deviceToken.isActive, true)));

    // Build token lookup: userId → token[]
    const tokenMap = new Map<string, string[]>();
    for (const t of tokens) {
      const existing = tokenMap.get(t.userId) || [];
      existing.push(t.fcmToken);
      tokenMap.set(t.userId, existing);
    }

    // Step 4: Filter by preferences and build notification targets
    const targets: NotificationTarget[] = [];

    for (const record of records) {
      const studentData = siswaMap.get(record.siswa_id);
      if (!studentData || !studentData.orangTuaId) continue;

      const parentId = studentData.orangTuaId;
      const prefKey = `${parentId}:${record.siswa_id}`;
      const pref = prefMap.get(prefKey);

      // Apply preference filtering:
      // - 'hadir' → only send if kehadiran_enabled (default: false)
      // - non-hadir (izin/sakit/alpa) → only send if ketidakhadiran_enabled (default: true)
      const isHadir = record.status === 'hadir';
      if (isHadir) {
        const kehadiranEnabled = pref ? pref.kehadiranEnabled : false;
        if (!kehadiranEnabled) continue;
      } else {
        const ketidakhadiranEnabled = pref ? pref.ketidakhadiranEnabled : true;
        if (!ketidakhadiranEnabled) continue;
      }

      // Get parent's device tokens
      const parentTokens = tokenMap.get(parentId);
      if (!parentTokens || parentTokens.length === 0) continue;

      // Create one target per device token (a parent may have multiple devices)
      for (const token of parentTokens) {
        targets.push({
          user_id: parentId,
          siswa_id: record.siswa_id,
          siswa_nama: studentData.nama,
          status: record.status,
          fcm_token: token,
        });
      }
    }

    if (targets.length === 0) {
      this.processorLogger.log(`Job ${job.id}: no notifications to send after filtering`);
      return;
    }

    // Step 5: Build FCM messages
    const fcmMessages: FcmMessage[] = targets.map((target) => ({
      token: target.fcm_token,
      notification: {
        title: `Absensi ${target.siswa_nama}`,
        body: `Status: ${target.status} — ${kelas_nama}, ${tanggal}. Dicatat pada ${waktu_input}`,
      },
      data: {
        type: 'absensi',
        siswa_id: target.siswa_id,
        tenant_id,
      },
    }));

    // Step 6: Send via FcmService (handles 500-token chunking internally)
    const fcmResult = await this.fcmService.sendBatch(fcmMessages);

    // Step 7: Batch INSERT notification records
    // Build unique notification records per parent+student (not per token)
    const notifRecordsMap = new Map<
      string,
      {
        tenantId: string;
        userId: string;
        siswaId: string;
        tipe: string;
        judul: string;
        pesan: string;
        data: Record<string, unknown>;
        statusPengiriman: 'terkirim' | 'gagal';
      }
    >();

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const result = fcmResult.results[i];
      const key = `${target.user_id}:${target.siswa_id}`;

      // If we already have a record for this parent+student, keep the best status
      const existing = notifRecordsMap.get(key);
      const currentStatus = result?.success ? 'terkirim' : 'gagal';

      if (!existing || (existing.statusPengiriman === 'gagal' && currentStatus === 'terkirim')) {
        notifRecordsMap.set(key, {
          tenantId: tenant_id,
          userId: target.user_id,
          siswaId: target.siswa_id,
          tipe: 'absensi',
          judul: `Absensi ${target.siswa_nama}`,
          pesan: `Status: ${target.status} — ${kelas_nama}, ${tanggal}. Dicatat pada ${waktu_input}`,
          data: { kelas_nama, tanggal, status: target.status },
          statusPengiriman: currentStatus as 'terkirim' | 'gagal',
        });
      }
    }

    const notifValues = [...notifRecordsMap.values()].map((n) => ({
      tenantId: n.tenantId,
      userId: n.userId,
      siswaId: n.siswaId,
      tipe: n.tipe,
      judul: n.judul,
      pesan: n.pesan,
      data: n.data,
      statusPengiriman: n.statusPengiriman,
      sentAt: new Date(),
    }));

    if (notifValues.length > 0) {
      await this.db.insert(notifikasi).values(notifValues);
    }

    this.processorLogger.log(
      `Job ${job.id}: sent ${fcmResult.successCount}/${fcmResult.total} FCM messages, ` +
        `created ${notifValues.length} notification records`,
    );
  }

  /**
   * Override dead letter handler: mark notification records as gagal after retry exhaustion.
   * Requirements: 6.7
   */
  protected override async handleDeadLetter(
    job: Job<BatchAttendanceJobData>,
    error: Error,
  ): Promise<void> {
    const { tenant_id, kelas_nama, tanggal, waktu_input, records } = job.data;

    this.processorLogger.error(
      `Dead letter: batch attendance notification for class ${kelas_nama} on ${tanggal}. ` +
        `Error: ${error.message}`,
    );

    // Attempt to create gagal notification records for audit trail
    try {
      const siswaIds = records.map((r) => r.siswa_id);
      const students = await this.db
        .select({ id: siswa.id, nama: siswa.nama, orangTuaId: siswa.orangTuaId })
        .from(siswa)
        .where(inArray(siswa.id, siswaIds));

      const gagalRecords = students
        .filter((s) => s.orangTuaId)
        .map((s) => {
          const record = records.find((r) => r.siswa_id === s.id);
          return {
            tenantId: tenant_id,
            userId: s.orangTuaId!,
            siswaId: s.id,
            tipe: 'absensi',
            judul: `Absensi ${s.nama}`,
            pesan: `Status: ${record?.status ?? 'unknown'} — ${kelas_nama}, ${tanggal}. Dicatat pada ${waktu_input}`,
            data: { kelas_nama, tanggal, status: record?.status, error: error.message },
            statusPengiriman: 'gagal' as const,
            retryCount: job.attemptsMade,
            sentAt: new Date(),
          };
        });

      if (gagalRecords.length > 0) {
        await this.db.insert(notifikasi).values(gagalRecords);
      }
    } catch (dbError) {
      this.processorLogger.error(
        `Failed to insert gagal records for dead letter job ${job.id}`,
        dbError instanceof Error ? dbError.stack : String(dbError),
      );
    }
  }
}
