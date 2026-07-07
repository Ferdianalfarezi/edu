import { ExecutionContext, Injectable } from '@nestjs/common';
import { RedisService } from '../../modules/redis/redis.service';
import { RateLimitConfig, RateLimitGuard } from './rate-limit.guard';

/**
 * General API rate limit:
 * - Authenticated users: 100 requests per minute (keyed by user ID)
 * - Unauthenticated requests: 30 requests per minute (keyed by IP)
 * Per ADR-005.
 */
@Injectable()
export class GeneralRateLimitGuard extends RateLimitGuard {
  constructor(redisService: RedisService) {
    super(redisService);
  }

  protected getConfig(context: ExecutionContext): RateLimitConfig {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.sub) {
      // Authenticated: 100 req/min per user
      return {
        limit: 100,
        windowSeconds: 60,
        message: 'Terlalu banyak permintaan. Coba lagi nanti.',
        keyExtractor: () => `rate:api:user:${user.sub}`,
      };
    }

    // Unauthenticated: 30 req/min per IP
    return {
      limit: 30,
      windowSeconds: 60,
      message: 'Terlalu banyak permintaan. Coba lagi nanti.',
      keyExtractor: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        const ip =
          req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
          req.ip ||
          req.socket?.remoteAddress ||
          'unknown';
        return `rate:api:ip:${ip}`;
      },
    };
  }
}
