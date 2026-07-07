import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { QueueMonitorService, QueueMetrics } from './queue-monitor.service';
import { QUEUE_NAMES } from '../../modules/queue/queue.constants';
import { MONITORING_CONFIG } from './monitoring.config';

describe('QueueMonitorService', () => {
  let service: QueueMonitorService;
  let mockQueues: Record<string, any>;

  function createMockQueue(overrides?: Partial<QueueMetrics>) {
    return {
      getWaitingCount: jest.fn().mockResolvedValue(overrides?.waiting ?? 0),
      getActiveCount: jest.fn().mockResolvedValue(overrides?.active ?? 0),
      getCompletedCount: jest.fn().mockResolvedValue(overrides?.completed ?? 0),
      getFailedCount: jest.fn().mockResolvedValue(overrides?.failed ?? 0),
      getDelayedCount: jest.fn().mockResolvedValue(overrides?.delayed ?? 0),
    };
  }

  beforeEach(async () => {
    mockQueues = {
      [QUEUE_NAMES.NOTIFICATION]: createMockQueue(),
      [QUEUE_NAMES.IMAGE]: createMockQueue(),
      [QUEUE_NAMES.IMPORT]: createMockQueue(),
      [QUEUE_NAMES.EXPORT]: createMockQueue(),
      [QUEUE_NAMES.EMAIL]: createMockQueue(),
      [QUEUE_NAMES.CRON]: createMockQueue(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueMonitorService,
        {
          provide: getQueueToken(QUEUE_NAMES.NOTIFICATION),
          useValue: mockQueues[QUEUE_NAMES.NOTIFICATION],
        },
        { provide: getQueueToken(QUEUE_NAMES.IMAGE), useValue: mockQueues[QUEUE_NAMES.IMAGE] },
        { provide: getQueueToken(QUEUE_NAMES.IMPORT), useValue: mockQueues[QUEUE_NAMES.IMPORT] },
        { provide: getQueueToken(QUEUE_NAMES.EXPORT), useValue: mockQueues[QUEUE_NAMES.EXPORT] },
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockQueues[QUEUE_NAMES.EMAIL] },
        { provide: getQueueToken(QUEUE_NAMES.CRON), useValue: mockQueues[QUEUE_NAMES.CRON] },
      ],
    }).compile();

    service = module.get<QueueMonitorService>(QueueMonitorService);
  });

  describe('getAllQueueMetrics', () => {
    it('should return metrics for all monitored queues', async () => {
      const metrics = await service.getAllQueueMetrics();

      expect(metrics).toHaveLength(6);
      expect(metrics.map((m) => m.name)).toEqual(
        expect.arrayContaining([
          QUEUE_NAMES.NOTIFICATION,
          QUEUE_NAMES.IMAGE,
          QUEUE_NAMES.IMPORT,
          QUEUE_NAMES.EXPORT,
          QUEUE_NAMES.EMAIL,
          QUEUE_NAMES.CRON,
        ]),
      );
    });

    it('should return correct counts from each queue', async () => {
      mockQueues[QUEUE_NAMES.NOTIFICATION].getWaitingCount.mockResolvedValue(10);
      mockQueues[QUEUE_NAMES.NOTIFICATION].getActiveCount.mockResolvedValue(3);
      mockQueues[QUEUE_NAMES.NOTIFICATION].getCompletedCount.mockResolvedValue(100);
      mockQueues[QUEUE_NAMES.NOTIFICATION].getFailedCount.mockResolvedValue(2);
      mockQueues[QUEUE_NAMES.NOTIFICATION].getDelayedCount.mockResolvedValue(5);

      const metrics = await service.getAllQueueMetrics();
      const notifMetric = metrics.find((m) => m.name === QUEUE_NAMES.NOTIFICATION);

      expect(notifMetric).toEqual({
        name: QUEUE_NAMES.NOTIFICATION,
        waiting: 10,
        active: 3,
        completed: 100,
        failed: 2,
        delayed: 5,
      });
    });

    it('should handle queue errors gracefully with -1 values', async () => {
      mockQueues[QUEUE_NAMES.IMAGE].getWaitingCount.mockRejectedValue(new Error('Redis down'));

      const metrics = await service.getAllQueueMetrics();
      const imageMetric = metrics.find((m) => m.name === QUEUE_NAMES.IMAGE);

      expect(imageMetric).toEqual({
        name: QUEUE_NAMES.IMAGE,
        waiting: -1,
        active: -1,
        completed: -1,
        failed: -1,
        delayed: -1,
      });
    });
  });

  describe('checkQueueDepths', () => {
    it('should not log alerts when queues are below threshold', async () => {
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      await service.checkQueueDepths();

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should log alert when queue depth exceeds threshold', async () => {
      const threshold = MONITORING_CONFIG.alerts.queueDepthMax;
      // Set waiting + delayed > threshold
      mockQueues[QUEUE_NAMES.NOTIFICATION].getWaitingCount.mockResolvedValue(threshold + 1);
      mockQueues[QUEUE_NAMES.NOTIFICATION].getDelayedCount.mockResolvedValue(0);
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      await service.checkQueueDepths();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: 'queue_depth_exceeded',
          queue: QUEUE_NAMES.NOTIFICATION,
          totalPending: threshold + 1,
          threshold,
        }),
      );
    });

    it('should alert on combined waiting + delayed exceeding threshold', async () => {
      const threshold = MONITORING_CONFIG.alerts.queueDepthMax;
      mockQueues[QUEUE_NAMES.EXPORT].getWaitingCount.mockResolvedValue(300);
      mockQueues[QUEUE_NAMES.EXPORT].getDelayedCount.mockResolvedValue(250);
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      await service.checkQueueDepths();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          alert: 'queue_depth_exceeded',
          queue: QUEUE_NAMES.EXPORT,
          totalPending: 550,
        }),
      );
    });

    it('should not alert when exactly at threshold', async () => {
      const threshold = MONITORING_CONFIG.alerts.queueDepthMax;
      mockQueues[QUEUE_NAMES.EMAIL].getWaitingCount.mockResolvedValue(threshold);
      mockQueues[QUEUE_NAMES.EMAIL].getDelayedCount.mockResolvedValue(0);
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      await service.checkQueueDepths();

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
