import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        // Support REDIS_URL (Railway provides this) or fallback to individual vars
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          return new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
              if (times > 10) return null;
              return Math.min(times * 200, 5000);
            },
            lazyConnect: true,
            enableReadyCheck: false,
          });
        }

        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 10) return null; // stop retrying after 10 attempts
            return Math.min(times * 200, 5000);
          },
          lazyConnect: true,
          enableReadyCheck: false,
        });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
