import { Module } from '@nestjs/common';
import { KenaikanKelasService } from './kenaikan-kelas.service';
import { KenaikanKelasController } from './kenaikan-kelas.controller';

@Module({
  controllers: [KenaikanKelasController],
  providers: [KenaikanKelasService],
  exports: [KenaikanKelasService],
})
export class KenaikanKelasModule {}
