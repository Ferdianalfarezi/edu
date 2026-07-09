import { ExecutionContext, Injectable } from '@nestjs/common';
import { RedisService } from '../../modules/redis/redis.service';
import { RateLimitConfig, RateLimitGuard } from './rate-limit.guard';

/**
 * Billing generation rate limit: max 2 requests per minute per tenant.
 * Prevents accidental double-clicks on expensive batch operations.
 * Per ADR-005.
 */
@Injectable()
export class BillingRateLimitGuard extends RateLimitGuard {
  constructor(redisService: RedisService) {
    super(redisService);
  }

  protected getConfig(_context: ExecutionContext): RateLimitConfig {
    return {
      limit: 2,
      windowSeconds: 60, // 1 minute
      message: 'Operasi billing terlalu sering. Coba lagi dalam 1 menit.',
      keyExtractor: (ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const tenantId = request.user?.tenant_id;
        if (!tenantId) return null;
        return `rate:billing:tenant:${tenantId}`;
      },
    };
  }
}
