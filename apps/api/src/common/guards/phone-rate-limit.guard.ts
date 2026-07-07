import { ExecutionContext, Injectable } from '@nestjs/common';
import { RedisService } from '../../modules/redis/redis.service';
import { RateLimitConfig, RateLimitGuard } from './rate-limit.guard';

/**
 * Rate limits phone login attempts: max 5 per phone number per hour.
 * After limit hit, returns same 429 response regardless of phone existence
 * to prevent enumeration attacks.
 * Per ADR-005.
 */
@Injectable()
export class PhoneRateLimitGuard extends RateLimitGuard {
  constructor(redisService: RedisService) {
    super(redisService);
  }

  protected getConfig(context: ExecutionContext): RateLimitConfig {
    return {
      limit: 5,
      windowSeconds: 3600, // 1 hour
      message: 'Terlalu banyak percobaan login. Coba lagi dalam 1 jam.',
      keyExtractor: (ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const phone = request.body?.phone;
        if (!phone) return null;
        return `rate:phone-login:${phone}`;
      },
    };
  }
}
