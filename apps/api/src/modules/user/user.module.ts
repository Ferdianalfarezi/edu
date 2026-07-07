import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { QUEUE_NAMES } from '@/modules/queue';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL })],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
