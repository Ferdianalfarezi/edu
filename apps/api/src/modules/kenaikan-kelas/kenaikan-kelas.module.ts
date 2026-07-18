import { Module } from '@nestjs/common';
import { KenaikanKelasService } from './kenaikan-kelas.service';
import { KenaikanKelasController } from './kenaikan-kelas.controller';
import { SiswaModule } from '../siswa/siswa.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [SiswaModule, TenantModule],
  controllers: [KenaikanKelasController],
  providers: [KenaikanKelasService],
  exports: [KenaikanKelasService],
})
export class KenaikanKelasModule {}
