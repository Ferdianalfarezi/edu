import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { RaporController } from './rapor.controller';
import { RaporOrangTuaController } from './rapor-orangtua.controller';
import { KomponenPenilaianController } from './komponen-penilaian.controller';
import { RaporNilaiService } from './rapor-nilai.service';
import { RaporOverviewService } from './rapor-overview.service';
import { RaporOrangTuaService } from './rapor-orangtua.service';
import { RaporFinalizationService } from './rapor-finalization.service';
import { RaporExportService } from './rapor-export.service';
import { KomponenPenilaianService } from './komponen-penilaian.service';
import { QUEUE_NAMES } from '@/modules/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION }, { name: QUEUE_NAMES.EXPORT }),
  ],
  controllers: [RaporController, RaporOrangTuaController, KomponenPenilaianController],
  providers: [
    RaporNilaiService,
    RaporOverviewService,
    RaporOrangTuaService,
    RaporFinalizationService,
    RaporExportService,
    KomponenPenilaianService,
  ],
  exports: [
    RaporNilaiService,
    RaporOverviewService,
    RaporOrangTuaService,
    RaporFinalizationService,
    RaporExportService,
    KomponenPenilaianService,
  ],
})
export class RaporModule {}
