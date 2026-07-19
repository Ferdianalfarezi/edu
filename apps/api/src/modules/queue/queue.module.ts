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
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        // Support REDIS_URL (Railway/Heroku style) or individual host/port/password
        if (redisUrl) {
          const url = new URL(redisUrl);
          return {
            redis: {
              host: url.hostname,
              port: Number(url.port) || 6379,
              password: url.password || undefined,
              username: url.username || undefined,
            },
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
          };
        }

        return {
          redis: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        };
      },
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
