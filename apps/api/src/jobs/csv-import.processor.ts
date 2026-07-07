import { Inject, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { UserService } from '@/modules/user/user.service';
import { SiswaService } from '@/modules/siswa/siswa.service';
import { BaseProcessor } from './base.processor';

/**
 * Job types supported by the CSV import processor.
 */
export type CsvImportJobType = 'bulk-import-guru' | 'bulk-import-siswa';

/**
 * Job payload for bulk guru CSV import.
 */
export interface BulkImportGuruJobData {
  type: 'bulk-import-guru';
  tenant_id: string;
  csv_content: string;
}

/**
 * Job payload for bulk siswa CSV import.
 */
export interface BulkImportSiswaJobData {
  type: 'bulk-import-siswa';
  tenant_id: string;
  csv_content: string;
  processed_by_user_id: string;
}

export type CsvImportJobData = BulkImportGuruJobData | BulkImportSiswaJobData;

/**
 * CsvImportProcessor handles async large-file CSV imports via Bull queue.
 *
 * Job types:
 * - `bulk-import-guru`: delegates to UserService.bulkImportGuru
 * - `bulk-import-siswa`: delegates to SiswaService.bulkImportSiswa
 *
 * For now, the inline (synchronous) CSV processing in the controllers/services
 * handles normal-sized imports. This processor exists for future async large-file
 * imports and provides proper error handling with retry via BaseProcessor.
 *
 * Requirements: 18.6, 21.1
 */
@Processor(QUEUE_NAMES.IMPORT)
export class CsvImportProcessor extends BaseProcessor {
  private readonly processorLogger = new Logger(CsvImportProcessor.name);

  constructor(
    private readonly userService: UserService,
    private readonly siswaService: SiswaService,
  ) {
    super('CsvImportProcessor', { concurrency: 2, maxAttempts: 3 });
  }

  @Process('bulk-import-guru')
  async handleBulkImportGuru(job: Job<BulkImportGuruJobData>): Promise<void> {
    const { tenant_id, csv_content } = job.data;

    if (!csv_content || csv_content.trim().length === 0) {
      this.processorLogger.warn(`Job ${job.id}: empty CSV content, skipping`);
      return;
    }

    this.processorLogger.log(`Job ${job.id}: starting bulk guru import for tenant ${tenant_id}`);

    const result = await this.userService.bulkImportGuru(tenant_id, csv_content);

    this.processorLogger.log(
      `Job ${job.id}: bulk guru import completed — ` +
        `created: ${result.created}, skipped: ${result.skipped.length}, total: ${result.total}`,
    );
  }

  @Process('bulk-import-siswa')
  async handleBulkImportSiswa(job: Job<BulkImportSiswaJobData>): Promise<void> {
    const { tenant_id, csv_content, processed_by_user_id } = job.data;

    if (!csv_content || csv_content.trim().length === 0) {
      this.processorLogger.warn(`Job ${job.id}: empty CSV content, skipping`);
      return;
    }

    this.processorLogger.log(`Job ${job.id}: starting bulk siswa import for tenant ${tenant_id}`);

    const result = await this.siswaService.bulkImportSiswa(
      tenant_id,
      csv_content,
      processed_by_user_id,
    );

    this.processorLogger.log(
      `Job ${job.id}: bulk siswa import completed — ` +
        `created: ${result.created}, skipped: ${result.skipped.length}, total: ${result.total}`,
    );
  }

  /**
   * Override dead letter handler to log import failures with full context.
   */
  protected override async handleDeadLetter(
    job: Job<CsvImportJobData>,
    error: Error,
  ): Promise<void> {
    const { type, tenant_id } = job.data;
    const csvLength = job.data.csv_content?.length ?? 0;

    this.processorLogger.error(
      `Dead letter: ${type} for tenant ${tenant_id} ` +
        `(CSV size: ${csvLength} chars). Error: ${error.message}`,
    );
  }
}
