import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RedisService } from '../../modules/redis/redis.service';

export interface RateLimitConfig {
  /** Max number of requests allowed within the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** A function to derive the rate limit key from the request context */
  keyExtractor: (context: ExecutionContext) => string | null;
  /** Custom error message */
  message?: string;
}

/**
 * Base rate limit guard using Redis sliding window counter.
 * Implements fail-open strategy: if Redis is unreachable, allow the request.
 * Per ADR-005.
 */
@Injectable()
export abstract class RateLimitGuard implements CanActivate {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly redisService: RedisService) {}

  protected abstract getConfig(context: ExecutionContext): RateLimitConfig;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.getConfig(context);
    const key = config.keyExtractor(context);

    // If no key can be derived, skip rate limiting
    if (!key) {
      return true;
    }

    try {
      const count = await this.redisService.increment(key, config.windowSeconds);

      if (count > config.limit) {
        const response = context.switchToHttp().getResponse();
        response.setHeader('Retry-After', String(config.windowSeconds));

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: config.message || 'Terlalu banyak percobaan. Coba lagi nanti.',
            retryAfter: config.windowSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      // If we already threw a 429, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }

      // Fail-open: if Redis is unreachable, allow the request (per ADR-005)
      this.logger.warn(
        `Rate limit check failed (Redis unreachable?). Allowing request. Key: ${key}`,
        error instanceof Error ? error.message : String(error),
      );
      return true;
    }
  }
}
