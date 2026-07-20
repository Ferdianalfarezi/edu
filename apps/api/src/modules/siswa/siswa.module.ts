import { Module } from '@nestjs/common';
import { SiswaService } from './siswa.service';
import { SiswaController } from './siswa.controller';
import { RiwayatKelasHelper } from './riwayat-kelas.helper';

@Module({
  controllers: [SiswaController],
  providers: [SiswaService, RiwayatKelasHelper],
  exports: [SiswaService, RiwayatKelasHelper],
})
export class SiswaModule {}
