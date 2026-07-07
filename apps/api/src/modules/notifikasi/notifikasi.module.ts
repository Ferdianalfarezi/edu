import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotifikasiController } from './notifikasi.controller';
import { NotifikasiService } from './notifikasi.service';
import { DeviceTokenController } from './device-token.controller';
import { DeviceTokenService } from './device-token.service';
import { FcmService } from './fcm.service';
import { BatchAttendanceNotificationProcessor } from '@/jobs/notification.processor';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION })],
  controllers: [NotifikasiController, DeviceTokenController],
  providers: [
    NotifikasiService,
    DeviceTokenService,
    FcmService,
    BatchAttendanceNotificationProcessor,
  ],
  exports: [NotifikasiService, DeviceTokenService, FcmService],
})
export class NotifikasiModule {}
