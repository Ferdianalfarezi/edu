import { Module } from '@nestjs/common';
import { TenantModule } from '@/modules/tenant/tenant.module';
import { JadwalController } from './jadwal.controller';
import { JadwalService } from './jadwal.service';

@Module({
  imports: [TenantModule],
  controllers: [JadwalController],
  providers: [JadwalService],
  exports: [JadwalService],
})
export class JadwalModule {}
