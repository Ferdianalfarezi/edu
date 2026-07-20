import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolConfig } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DrizzleService.name);
  private pool: Pool;
  public db: NodePgDatabase;

  constructor(private readonly configService: ConfigService) {
    const poolConfig: PoolConfig = {
      connectionString: this.configService.get<string>('DATABASE_URL'),
      max: this.configService.get<number>('DB_POOL_MAX', 20),
      min: this.configService.get<number>('DB_POOL_MIN', 5),
      idleTimeoutMillis: this.configService.get<number>('DB_IDLE_TIMEOUT', 30000),
      connectionTimeoutMillis: 5000,
    };

    this.pool = new Pool(poolConfig);
    this.db = drizzle(this.pool);
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      client.release();
      this.logger.log(
        `Database connected (pool: min=${this.pool.options.min}, max=${this.pool.options.max}, idle=${this.pool.options.idleTimeoutMillis}ms)`,
      );
    } catch (error) {
      // Log but don't throw — let the app start and report degraded health.
      // Railway healthcheck will catch persistent DB failures after grace period.
      this.logger.error(
        'Failed to connect to database on startup (will retry on first query)',
        error,
      );
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Database pool closed');
  }

  /**
   * Get the underlying pg Pool for advanced use cases
   * (e.g., acquiring a client to SET LOCAL for RLS)
   */
  getPool(): Pool {
    return this.pool;
  }
}
