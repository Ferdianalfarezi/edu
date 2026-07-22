import { Module } from '@nestjs/common';
import { BarangController } from './barang.controller';
import { BarangService } from './barang.service';

@Module({
  controllers: [BarangController],
  providers: [BarangService],
  exports: [BarangService],
})
export class BarangModule {}
