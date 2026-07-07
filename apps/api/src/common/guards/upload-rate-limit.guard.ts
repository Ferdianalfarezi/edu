import { ExecutionContext, Injectable } from '@nestjs/common';
import { RedisService } from '../../modules/redis/redis.service';
import { RateLimitConfig, RateLimitGuard } from './rate-limit.guard';

/**
 * File upload rate limit: max 10 requests per 5 minutes per user.
 * Per ADR-005.
 */
@Injectable()
export class UploadRateLimitGuard extends RateLimitGuard {
  constructor(redisService: RedisService) {
    super(redisService);
  }

  protected getConfig(context: ExecutionContext): RateLimitConfig {
    return {
      limit: 10,
      windowSeconds: 300, // 5 minutes
      message: 'Terlalu banyak upload. Coba lagi dalam beberapa menit.',
      keyExtractor: (ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const userId = request.user?.sub;
        if (!userId) return null;
        return `rate:upload:user:${userId}`;
      },
    };
  }
}
