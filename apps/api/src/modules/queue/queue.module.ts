import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queue.constants';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'fixed' as const,
    delay: 60_000, // 60 seconds between retries
  },
  removeOnComplete: true,
  removeOnFail: false, // keep failed jobs for inspection (dead letter)
};

@Global()
@Module({
  imports: [
    // Root Bull configuration with Redis connection
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
      inject: [ConfigService],
    }),

    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.IMAGE },
      { name: QUEUE_NAMES.IMPORT },
      { name: QUEUE_NAMES.EXPORT },
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.CRON },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
