import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WorkerModule } from './worker.module';

/**
 * Worker process entry point.
 * Runs BullMQ queue processors separately from the API server.
 * Deployed as its own Railway service with 512MB RAM (ADR-006).
 *
 * Does NOT expose an HTTP server — only processes background jobs:
 * - notification (batch attendance, tagihan, rapor)
 * - image (compress bukti transfer to WebP)
 * - import (CSV bulk user/siswa import)
 * - export (Excel/CSV report generation)
 * - email (password reset, credential delivery)
 * - cron (file cleanup, token cleanup)
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const configService = app.get(ConfigService);

  const env = configService.get('NODE_ENV', 'development');
  console.log(`🔧 Worker started in ${env} mode`);
  console.log(`📋 Processing queues: notification, image, import, export, email, cron`);
}

bootstrap();
