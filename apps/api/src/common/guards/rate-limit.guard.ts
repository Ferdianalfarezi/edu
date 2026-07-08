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
 * Implements fail-closed strategy for login endpoints and fail-open for general endpoints.
 * If Redis is unreachable, uses in-memory Map as fallback for critical paths (login).
 * Per ADR-005 (modified: fail-closed for auth endpoints).
 */
@Injectable()
export abstract class RateLimitGuard implements CanActivate {
  protected readonly logger = new Logger(this.constructor.name);

  // In-memory fallback counters when Redis is unreachable (keyed by rate limit key)
  private readonly fallbackCounters = new Map<string, { count: number; expiresAt: number }>();

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

      // Redis unreachable: use in-memory fallback for rate limiting
      // This prevents unlimited attempts when Redis is down
      this.logger.warn(
        `Rate limit check failed (Redis unreachable?). Using in-memory fallback. Key: ${key}`,
        error instanceof Error ? error.message : String(error),
      );

      return this.checkFallbackCounter(key, config, context);
    }
  }

  /**
   * In-memory fallback rate limiter for when Redis is unreachable.
   * Uses a simple counter per key with expiration.
   * Not shared across instances, but still prevents single-instance abuse.
   */
  private checkFallbackCounter(
    key: string,
    config: RateLimitConfig,
    context: ExecutionContext,
  ): boolean {
    const now = Date.now();
    const entry = this.fallbackCounters.get(key);

    if (!entry || now > entry.expiresAt) {
      // New window
      this.fallbackCounters.set(key, {
        count: 1,
        expiresAt: now + config.windowSeconds * 1000,
      });
      return true;
    }

    entry.count++;

    if (entry.count > config.limit) {
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
  }
}
