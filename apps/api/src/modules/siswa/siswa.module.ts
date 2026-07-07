import { Module } from '@nestjs/common';
import { SiswaService } from './siswa.service';
import { SiswaController } from './siswa.controller';

@Module({
  controllers: [SiswaController],
  providers: [SiswaService],
  exports: [SiswaService],
})
export class SiswaModule {}
