import { Module } from '@nestjs/common';
import { KonfigurasiBiayaController } from './konfigurasi-biaya.controller';
import { KonfigurasiBiayaService } from './konfigurasi-biaya.service';

/**
 * Modul untuk pengelolaan konfigurasi biaya sekolah.
 *
 * Mendukung override nominal biaya per siswa dan per kelas.
 * Digunakan oleh TagihanService untuk menentukan nominal saat generate tagihan.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.6
 */
@Module({
  controllers: [KonfigurasiBiayaController],
  providers: [KonfigurasiBiayaService],
  exports: [KonfigurasiBiayaService],
})
export class KonfigurasiBiayaModule {}
