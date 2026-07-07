import { Module } from '@nestjs/common';
import { KelasModule } from '@/modules/kelas/kelas.module';
import { TahunAjaranService } from './tahun-ajaran.service';
import { TahunAjaranController } from './tahun-ajaran.controller';

@Module({
  imports: [KelasModule],
  controllers: [TahunAjaranController],
  providers: [TahunAjaranService],
  exports: [TahunAjaranService],
})
export class TahunAjaranModule {}
