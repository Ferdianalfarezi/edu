import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PengumumanController } from './pengumuman.controller';
import { PengumumanService } from './pengumuman.service';
import { NotifikasiModule } from '@/modules/notifikasi/notifikasi.module';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION }), NotifikasiModule],
  controllers: [PengumumanController],
  providers: [PengumumanService],
})
export class PengumumanModule {}
