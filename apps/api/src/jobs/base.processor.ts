import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { OnQueueActive, OnQueueCompleted, OnQueueFailed, OnQueueStalled } from '@nestjs/bull';

export interface BaseJobData {
  tenant_id?: string;
  [key: string]: unknown;
}

export interface ProcessorOptions {
  /** Maximum number of jobs processed concurrently. Default: 5 */
  concurrency?: number;
  /** Maximum number of retry attempts before marking as dead letter. Default: 3 */
  maxAttempts?: number;
}

/**
 * Base processor class for all Bull queue workers.
 *
 * Provides:
 * - Structured error logging with job context
 * - Retry tracking with configurable backoff
 * - Dead letter handling when retries are exhausted
 * - Job lifecycle event hooks (active, completed, failed, stalled)
 *
 * Usage:
 * ```
 * @Processor(QUEUE_NAMES.NOTIFICATION)
 * export class NotificationProcessor extends BaseProcessor {
 *   constructor() {
 *     super('NotificationProcessor', { concurrency: 10 });
 *   }
 *
 *   @Process('send-batch-attendance-notification')
 *   async handleBatchAttendance(job: Job<BatchAttendanceData>) {
 *     // implementation
 *   }
 * }
 * ```
 */
export abstract class BaseProcessor {
  protected readonly logger: Logger;
  protected readonly options: Required<ProcessorOptions>;

  constructor(processorName: string, options: ProcessorOptions = {}) {
    this.logger = new Logger(processorName);
    this.options = {
      concurrency: options.concurrency ?? 5,
      maxAttempts: options.maxAttempts ?? 3,
    };
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(
      `Processing job ${job.id} [${job.name}] (attempt ${job.attemptsMade + 1}/${this.options.maxAttempts})`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Completed job ${job.id} [${job.name}] in ${Date.now() - job.processedOn!}ms`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    const isDeadLetter = job.attemptsMade >= this.options.maxAttempts;

    if (isDeadLetter) {
      this.logger.error(
        `DEAD LETTER: Job ${job.id} [${job.name}] exhausted ${this.options.maxAttempts} retries. ` +
          `Error: ${error.message}`,
        error.stack,
      );
      this.handleDeadLetter(job, error).catch((dlError) => {
        this.logger.error(
          `Failed to handle dead letter for job ${job.id}: ${dlError.message}`,
          dlError.stack,
        );
      });
    } else {
      this.logger.warn(
        `Job ${job.id} [${job.name}] failed (attempt ${job.attemptsMade}/${this.options.maxAttempts}). ` +
          `Will retry. Error: ${error.message}`,
      );
    }
  }

  @OnQueueStalled()
  onStalled(job: Job) {
    this.logger.warn(`Stalled job ${job.id} [${job.name}] — will be reprocessed`);
  }

  /**
   * Handle jobs that have exhausted all retries (dead letter).
   * Override in subclasses to implement custom dead letter behavior
   * (e.g., persist to a dead letter table, send alert).
   */
  protected async handleDeadLetter(job: Job, _error: Error): Promise<void> {
    // Default: log the full job data for manual inspection.
    // Subclasses can override to persist to DB or notify.
    this.logger.error(`Dead letter payload for job ${job.id}: ${JSON.stringify(job.data)}`);
  }
}
