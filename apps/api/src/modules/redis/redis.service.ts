import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // ─── Cache Operations ───────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  // ─── Token Blacklist Operations ─────────────────────────────────

  /**
   * Blacklist a JWT by its JTI. TTL should match remaining token lifetime.
   */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
  }

  /**
   * Check if a token JTI is blacklisted.
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.exists(`blacklist:${jti}`);
    return result === 1;
  }

  // ─── Distributed Lock Operations ───────────────────────────────

  /**
   * Acquire a distributed lock. Returns true if acquired.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(`lock:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Release a distributed lock.
   */
  async releaseLock(key: string): Promise<void> {
    await this.redis.del(`lock:${key}`);
  }

  // ─── Counter Operations ─────────────────────────────────────────

  /**
   * Increment a counter with optional TTL (useful for rate limiting).
   */
  async increment(key: string, ttlSeconds?: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (ttlSeconds && count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return count;
  }

  // ─── Raw Client Access ──────────────────────────────────────────

  getClient(): Redis {
    return this.redis;
  }
}
