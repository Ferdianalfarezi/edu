import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../modules/queue/queue.constants';
import { MONITORING_CONFIG } from './monitoring.config';

export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Monitors Bull queue depths and logs alerts when thresholds from ADR-006 are exceeded.
 * In production, these logs can trigger alerts in Railway's log-based alerting
 * or an external monitoring service (Datadog, Grafana, etc.).
 */
@Injectable()
export class QueueMonitorService {
  private readonly logger = new Logger(QueueMonitorService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMAGE) private readonly imageQueue: Queue,
    @InjectQueue(QUEUE_NAMES.IMPORT) private readonly importQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EXPORT) private readonly exportQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CRON) private readonly cronQueue: Queue,
  ) {}

  /**
   * Periodically check queue depths. Runs every 30 seconds.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkQueueDepths(): Promise<void> {
    const metrics = await this.getAllQueueMetrics();
    const threshold = MONITORING_CONFIG.alerts.queueDepthMax;

    for (const metric of metrics) {
      const totalPending = metric.waiting + metric.delayed;

      if (totalPending > threshold) {
        this.logger.error({
          message: 'ALERT: Queue depth exceeds threshold',
          alert: 'queue_depth_exceeded',
          queue: metric.name,
          waiting: metric.waiting,
          delayed: metric.delayed,
          totalPending,
          threshold,
          active: metric.active,
          failed: metric.failed,
        });
      }
    }
  }

  /**
   * Get metrics for all monitored queues.
   */
  async getAllQueueMetrics(): Promise<QueueMetrics[]> {
    const queues: Record<string, Queue> = {
      [QUEUE_NAMES.NOTIFICATION]: this.notificationQueue,
      [QUEUE_NAMES.IMAGE]: this.imageQueue,
      [QUEUE_NAMES.IMPORT]: this.importQueue,
      [QUEUE_NAMES.EXPORT]: this.exportQueue,
      [QUEUE_NAMES.EMAIL]: this.emailQueue,
      [QUEUE_NAMES.CRON]: this.cronQueue,
    };

    const metrics: QueueMetrics[] = [];

    for (const [name, queue] of Object.entries(queues)) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        metrics.push({ name, waiting, active, completed, failed, delayed });
      } catch (error) {
        this.logger.warn(`Failed to get metrics for queue: ${name}`, error);
        metrics.push({ name, waiting: -1, active: -1, completed: -1, failed: -1, delayed: -1 });
      }
    }

    return metrics;
  }
}
