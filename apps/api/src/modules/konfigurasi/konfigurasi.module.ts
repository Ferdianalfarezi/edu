import { Module } from '@nestjs/common';
import { TenantModule } from '@/modules/tenant/tenant.module';
import { KonfigurasiService } from './konfigurasi.service';
import { KonfigurasiController } from './konfigurasi.controller';
import { HariLiburController } from './hari-libur.controller';

@Module({
  imports: [TenantModule],
  controllers: [HariLiburController, KonfigurasiController],
  providers: [KonfigurasiService],
  exports: [KonfigurasiService],
})
export class KonfigurasiModule {}
