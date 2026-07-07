import { Module } from '@nestjs/common';
import { MataPelajaranController } from './mata-pelajaran.controller';
import { MataPelajaranService } from './mata-pelajaran.service';

@Module({
  controllers: [MataPelajaranController],
  providers: [MataPelajaranService],
  exports: [MataPelajaranService],
})
export class MataPelajaranModule {}
