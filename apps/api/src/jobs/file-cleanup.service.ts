import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, isNotNull, lt, eq } from 'drizzle-orm';
import { DRIZZLE } from '@/drizzle/drizzle.module';
import { StorageService } from '@/modules/storage/storage.service';
import { tagihanTransaksi } from '@/drizzle/schema/tagihan';

/**
 * Scheduled file cleanup service.
 *
 * Runs daily at 2 AM to delete bukti_transfer files from R2
 * that have been verified more than 3 years ago.
 * Metadata (transaction records) is preserved per Requirement 11.17.
 *
 * Requirements: 11.16, 11.17
 */
@Injectable()
export class FileCleanupService {
  private readonly logger = new Logger(FileCleanupService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Daily cron job at 2:00 AM server time.
   * Deletes bukti_transfer files older than 3 years from verification date.
   */
  @Cron('0 2 * * *')
  async handleBuktiTransferCleanup(): Promise<{ deleted: number; failed: number }> {
    this.logger.log('Starting bukti_transfer file cleanup...');

    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    // Query transactions where:
    // - verified_at is older than 3 years
    // - bukti_transfer_url is not null (file still exists)
    // - status is 'approved' (only clean up verified payments)
    const expiredTransactions = await this.db
      .select({
        id: tagihanTransaksi.id,
        buktiTransferUrl: tagihanTransaksi.buktiTransferUrl,
      })
      .from(tagihanTransaksi)
      .where(
        and(
          lt(tagihanTransaksi.verifiedAt, threeYearsAgo),
          isNotNull(tagihanTransaksi.buktiTransferUrl),
          eq(tagihanTransaksi.status, 'approved'),
        ),
      );

    if (expiredTransactions.length === 0) {
      this.logger.log('No expired bukti_transfer files to clean up.');
      return { deleted: 0, failed: 0 };
    }

    this.logger.log(`Found ${expiredTransactions.length} expired bukti_transfer files to delete.`);

    let deleted = 0;
    let failed = 0;

    for (const transaction of expiredTransactions) {
      try {
        // Delete file from R2 storage
        await this.storageService.delete(transaction.buktiTransferUrl);

        // Set bukti_transfer_url to NULL in DB (metadata preserved per Req 11.17)
        await this.db
          .update(tagihanTransaksi)
          .set({ buktiTransferUrl: null })
          .where(eq(tagihanTransaksi.id, transaction.id));

        deleted++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to delete file for transaction ${transaction.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Bukti_transfer cleanup complete. Deleted: ${deleted}, Failed: ${failed}`);

    return { deleted, failed };
  }
}
