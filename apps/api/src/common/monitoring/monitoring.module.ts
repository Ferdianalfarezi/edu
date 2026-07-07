import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../../modules/queue/queue.constants';
import { QueueMonitorService } from './queue-monitor.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.IMAGE },
      { name: QUEUE_NAMES.IMPORT },
      { name: QUEUE_NAMES.EXPORT },
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.CRON },
    ),
  ],
  providers: [QueueMonitorService],
  exports: [QueueMonitorService],
})
export class MonitoringModule {}
