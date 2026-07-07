import { Module } from '@nestjs/common';
import { KonfigurasiService } from './konfigurasi.service';
import { KonfigurasiController } from './konfigurasi.controller';
import { HariLiburController } from './hari-libur.controller';

@Module({
  controllers: [HariLiburController, KonfigurasiController],
  providers: [KonfigurasiService],
  exports: [KonfigurasiService],
})
export class KonfigurasiModule {}
