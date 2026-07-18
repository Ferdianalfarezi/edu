import { Module } from '@nestjs/common';
import { TenantModule } from '@/modules/tenant/tenant.module';
import { KelasService } from './kelas.service';
import { KelasController } from './kelas.controller';

@Module({
  imports: [TenantModule],
  controllers: [KelasController],
  providers: [KelasService],
  exports: [KelasService],
})
export class KelasModule {}
