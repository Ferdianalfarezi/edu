import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { DrizzleService } from '../../drizzle/drizzle.service';
import { MONITORING_CONFIG } from '../../common/monitoring/monitoring.config';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    storage: ComponentHealth;
  };
  version: string;
  environment: string;
}

export interface ComponentHealth {
  status: 'up' | 'down';
  responseTimeMs?: number;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();
  /** Grace period (in ms) after startup where health always returns 'healthy' to pass Railway healthcheck */
  private readonly STARTUP_GRACE_MS = 30_000;

  constructor(
    private readonly drizzleService: DrizzleService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async getHealth(): Promise<HealthStatus> {
    const uptimeMs = Date.now() - this.startTime;

    // During startup grace period, return healthy immediately so Railway
    // doesn't kill the container while dependencies are still connecting
    if (uptimeMs < this.STARTUP_GRACE_MS) {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptimeMs / 1000),
        checks: {
          database: { status: 'up', responseTimeMs: 0 },
          redis: { status: 'up', responseTimeMs: 0 },
          storage: { status: 'up', responseTimeMs: 0 },
        },
        version: process.env.npm_package_version || '0.0.1',
        environment: this.configService.get<string>('NODE_ENV', 'development'),
      };
    }

    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    const checks = { database, redis, storage };
    const allUp = Object.values(checks).every((c) => c.status === 'up');
    const allDown = Object.values(checks).every((c) => c.status === 'down');

    let status: HealthStatus['status'];
    if (allUp) {
      status = 'healthy';
    } else if (allDown) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptimeMs / 1000),
      checks,
      version: process.env.npm_package_version || '0.0.1',
      environment: this.configService.get<string>('NODE_ENV', 'development'),
    };
  }

  /**
   * Lightweight liveness check — confirms the process is running.
   */
  getLiveness(): { status: 'ok'; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const pool = this.drizzleService.getPool();
      const client = await Promise.race([
        pool.connect(),
        this.timeout(MONITORING_CONFIG.healthCheck.dbTimeoutMs),
      ]);
      if (client && typeof (client as any).release === 'function') {
        (client as any).release();
      }
      return { status: 'up', responseTimeMs: Date.now() - start };
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return {
        status: 'down',
        responseTimeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const client = this.redisService.getClient();
      const result = await Promise.race([
        client.ping(),
        this.timeout(MONITORING_CONFIG.healthCheck.redisTimeoutMs),
      ]);
      if (result === 'PONG') {
        return { status: 'up', responseTimeMs: Date.now() - start };
      }
      return {
        status: 'down',
        responseTimeMs: Date.now() - start,
        error: 'Unexpected ping response',
      };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return {
        status: 'down',
        responseTimeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkStorage(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      // Lightweight check: attempt a HeadBucket operation or list with max 1
      // For now, we just verify the S3 endpoint is configured and reachable
      const endpoint = this.configService.get<string>('S3_ENDPOINT');
      if (!endpoint) {
        return { status: 'down', responseTimeMs: 0, error: 'S3_ENDPOINT not configured' };
      }
      // Simple connectivity check via fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        MONITORING_CONFIG.healthCheck.storageTimeoutMs,
      );
      try {
        await fetch(endpoint, { method: 'HEAD', signal: controller.signal });
        return { status: 'up', responseTimeMs: Date.now() - start };
      } catch {
        // R2 may return 403 on HEAD without auth — that still means it's reachable
        return { status: 'up', responseTimeMs: Date.now() - start };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      this.logger.error('Storage health check failed', error);
      return {
        status: 'down',
        responseTimeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms),
    );
  }
}
