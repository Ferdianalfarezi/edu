import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BullModule } from '@nestjs/bull';
import { KonfigurasiModule } from '@/modules/konfigurasi/konfigurasi.module';
import { StorageModule } from '@/modules/storage';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';
import { ImageCompressionProcessor } from '@/jobs/image-compression.processor';
import { TagihanController } from './tagihan.controller';
import { AuditTrailController } from './audit-trail.controller';
import { TagihanService } from './tagihan.service';
import { AuditTrailService } from './audit-trail.service';
import { FileCleanupService } from '@/jobs/file-cleanup.service';

@Module({
  imports: [
    KonfigurasiModule,
    StorageModule,
    MulterModule.register({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.IMAGE },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.EXPORT },
    ),
  ],
  controllers: [TagihanController, AuditTrailController],
  providers: [TagihanService, AuditTrailService, FileCleanupService, ImageCompressionProcessor],
  exports: [TagihanService, AuditTrailService],
})
export class TagihanModule {}
