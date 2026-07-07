import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validate } from './config/env.validation';
import { DrizzleModule } from './drizzle/drizzle.module';
import { RedisModule } from './modules/redis';
import { QueueModule } from './modules/queue';
import { StorageModule } from './modules/storage';

/**
 * Worker module — includes only what's needed for background job processing.
 * No HTTP controllers, no auth guards, no throttling.
 * Shares DB, Redis, Queue, and Storage with the API but runs in a separate process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env'],
    }),

    // Database (for job processors that read/write data)
    DrizzleModule,

    // Redis (queue backend)
    RedisModule,

    // Bull queues (registers processors)
    QueueModule,

    // S3-compatible storage (R2 — image compression, file cleanup)
    StorageModule,

    // Scheduled tasks (cron jobs for file cleanup, etc.)
    ScheduleModule.forRoot(),
  ],
})
export class WorkerModule {}
