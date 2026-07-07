import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async (configService: ConfigService) => {
        const Redis = (await import('ioredis')).default;

        // Support REDIS_URL (Railway provides this) or fallback to individual vars
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          return new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
              if (times > 10) return null;
              return Math.min(times * 200, 5000);
            },
            lazyConnect: false,
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
          lazyConnect: false,
        });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
