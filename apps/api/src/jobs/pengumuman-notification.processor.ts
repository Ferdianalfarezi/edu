import { Inject, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { eq, inArray, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { deviceToken, notifikasi } from '@/drizzle/schema/notifikasi';
import { pengumuman } from '@/drizzle/schema/pengumuman';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { FcmService, FcmMessage } from '@/modules/notifikasi/fcm.service';
import { BaseProcessor } from './base.processor';

/**
 * Job payload for pengumuman notification.
 * Enqueued by PengumumanService after creating a pengumuman.
 */
export interface PengumumanJobData {
  pengumuman_id: string;
  tenant_id: string;
  judul: string;
  deskripsi: string;
  penerima_user_ids: string[];
}

/**
 * PengumumanNotificationProcessor handles sending push notifications
 * for announcements (pengumuman) to recipient parents.
 *
 * Processing steps:
 * 1. Batch query active device tokens for all recipient user IDs
 * 2. Build FCM messages with truncated body
 * 3. Send via FcmService.sendBatch()
 * 4. Insert notifikasi records per recipient with delivery status
 * 5. Update pengumuman.status based on overall delivery result
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
@Processor(QUEUE_NAMES.NOTIFICATION)
export class PengumumanNotificationProcessor extends BaseProcessor {
  private readonly processorLogger = new Logger(PengumumanNotificationProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase,
    private readonly fcmService: FcmService,
  ) {
    super('PengumumanNotificationProcessor', { concurrency: 10, maxAttempts: 3 });
  }

  @Process({
    name: 'send-pengumuman-notification',
    concurrency: 10,
  })
  async handleSendPengumumanNotification(job: Job<PengumumanJobData>): Promise<void> {
    const { pengumuman_id, tenant_id, judul, deskripsi, penerima_user_ids } = job.data;

    if (!penerima_user_ids || penerima_user_ids.length === 0) {
      this.processorLogger.warn(`Job ${job.id}: no recipients, skipping`);
      return;
    }

    // Step 1: Batch query active device tokens for all recipient user IDs
    const tokens = await this.db
      .select({
        userId: deviceToken.userId,
        fcmToken: deviceToken.fcmToken,
      })
      .from(deviceToken)
      .where(and(inArray(deviceToken.userId, penerima_user_ids), eq(deviceToken.isActive, true)));

    // Build token lookup: userId → token[]
    const tokenMap = new Map<string, string[]>();
    for (const t of tokens) {
      const existing = tokenMap.get(t.userId) || [];
      existing.push(t.fcmToken);
      tokenMap.set(t.userId, existing);
    }

    // Step 2: Build FCM messages
    const truncatedBody = deskripsi.length > 200 ? deskripsi.substring(0, 200) + '...' : deskripsi;

    const fcmMessages: FcmMessage[] = [];
    // Track which messages belong to which user for status determination
    const messageUserMap: { userId: string; tokenIndex: number }[] = [];

    for (const userId of penerima_user_ids) {
      const userTokens = tokenMap.get(userId);
      if (!userTokens || userTokens.length === 0) continue;

      for (const token of userTokens) {
        const msgIndex = fcmMessages.length;
        fcmMessages.push({
          token,
          notification: {
            title: judul,
            body: truncatedBody,
          },
          data: {
            pengumuman_id,
            tipe: 'pengumuman',
          },
        });
        messageUserMap.push({ userId, tokenIndex: msgIndex });
      }
    }

    if (fcmMessages.length === 0) {
      this.processorLogger.log(
        `Job ${job.id}: no active device tokens found for recipients, marking as gagal`,
      );
      // No tokens at all — mark all as gagal
      await this.insertNotifikasiRecords(
        penerima_user_ids,
        tenant_id,
        judul,
        truncatedBody,
        pengumuman_id,
        new Map(), // empty success map — all gagal
      );
      await this.updatePengumumanStatus(pengumuman_id, 'gagal');
      return;
    }

    // Step 3: Send via FcmService
    const fcmResult = await this.fcmService.sendBatch(fcmMessages);

    // Step 4: Determine per-recipient status
    // A recipient is 'terkirim' if at least one of their tokens succeeded
    const userSuccessMap = new Map<string, boolean>();

    for (const entry of messageUserMap) {
      const result = fcmResult.results[entry.tokenIndex];
      const currentSuccess = userSuccessMap.get(entry.userId) || false;
      if (result?.success) {
        userSuccessMap.set(entry.userId, true);
      } else if (!currentSuccess) {
        userSuccessMap.set(entry.userId, false);
      }
    }

    // Step 5: Insert notifikasi records for each recipient
    await this.insertNotifikasiRecords(
      penerima_user_ids,
      tenant_id,
      judul,
      truncatedBody,
      pengumuman_id,
      userSuccessMap,
    );

    // Step 6: Update pengumuman.status
    // 'terkirim' if ANY recipient succeeded, 'gagal' if ALL failed
    const anySuccess = [...userSuccessMap.values()].some((success) => success);
    const finalStatus = anySuccess ? 'terkirim' : 'gagal';
    await this.updatePengumumanStatus(pengumuman_id, finalStatus);

    this.processorLogger.log(
      `Job ${job.id}: sent ${fcmResult.successCount}/${fcmResult.total} FCM messages, ` +
        `status: ${finalStatus}`,
    );
  }

  /**
   * Insert notifikasi records for each recipient with appropriate delivery status.
   */
  private async insertNotifikasiRecords(
    penerimaUserIds: string[],
    tenantId: string,
    judul: string,
    truncatedBody: string,
    pengumumanId: string,
    userSuccessMap: Map<string, boolean>,
  ): Promise<void> {
    const notifValues = penerimaUserIds.map((userId) => ({
      tenantId,
      userId,
      siswaId: null,
      tipe: 'pengumuman',
      judul,
      pesan: truncatedBody,
      data: { pengumuman_id: pengumumanId, tipe: 'pengumuman' },
      statusPengiriman: (userSuccessMap.get(userId) ? 'terkirim' : 'gagal') as 'terkirim' | 'gagal',
      sentAt: new Date(),
    }));

    if (notifValues.length > 0) {
      await this.db.insert(notifikasi).values(notifValues);
    }
  }

  /**
   * Update pengumuman status to 'terkirim' or 'gagal'.
   */
  private async updatePengumumanStatus(
    pengumumanId: string,
    status: 'terkirim' | 'gagal',
  ): Promise<void> {
    await this.db
      .update(pengumuman)
      .set({ status, updatedAt: new Date() })
      .where(eq(pengumuman.id, pengumumanId));
  }

  /**
   * Override dead letter handler: update pengumuman.status to 'gagal'
   * when all retries are exhausted.
   *
   * Requirements: 4.4
   */
  protected override async handleDeadLetter(
    job: Job<PengumumanJobData>,
    error: Error,
  ): Promise<void> {
    const { pengumuman_id, judul } = job.data;

    this.processorLogger.error(
      `Dead letter: pengumuman notification for "${judul}" (${pengumuman_id}). ` +
        `Error: ${error.message}`,
    );

    try {
      await this.updatePengumumanStatus(pengumuman_id, 'gagal');
    } catch (dbError) {
      this.processorLogger.error(
        `Failed to update pengumuman status to gagal for dead letter job ${job.id}`,
        dbError instanceof Error ? dbError.stack : String(dbError),
      );
    }
  }
}
