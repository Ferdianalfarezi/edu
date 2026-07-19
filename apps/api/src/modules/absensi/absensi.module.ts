import { Module } from '@nestjs/common';
import { JadwalModule } from '@/modules/jadwal/jadwal.module';
import { KonfigurasiModule } from '@/modules/konfigurasi/konfigurasi.module';
import { TenantModule } from '@/modules/tenant/tenant.module';
import { AbsensiController } from './absensi.controller';
import { AbsensiService } from './absensi.service';

@Module({
  imports: [JadwalModule, KonfigurasiModule, TenantModule],
  controllers: [AbsensiController],
  providers: [AbsensiService],
  exports: [AbsensiService],
})
export class AbsensiModule {}
