import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Test database helper for integration tests.
 * Manages per-test-suite connections and transaction-based cleanup.
 */
export class TestDatabase {
  private pool: Pool | null = null;
  private client: Client | null = null;
  private _db: NodePgDatabase | null = null;

  get db(): NodePgDatabase {
    if (!this._db) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }
    return this._db;
  }

  get connectionPool(): Pool {
    if (!this.pool) {
      throw new Error('TestDatabase not initialized. Call setup() first.');
    }
    return this.pool;
  }

  /**
   * Set up the test database connection.
   * Call this in beforeAll().
   */
  async setup(): Promise<void> {
    const dbName = process.env.TEST_DB_NAME || 'edu_test';
    const connectionString =
      process.env.TEST_DATABASE_URL || `postgresql://postgres:postgres@localhost:5432/${dbName}`;

    this.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10000,
    });

    this._db = drizzle(this.pool);
  }

  /**
   * Clean all data from the database between tests.
   * Uses TRUNCATE CASCADE for speed.
   * Call this in beforeEach() or afterEach().
   */
  async clean(tableNames: string[]): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      // Truncate all specified tables in one statement for speed
      if (tableNames.length > 0) {
        const quoted = tableNames.map((t) => `"${t}"`).join(', ');
        await client.query(`TRUNCATE TABLE ${quoted} CASCADE`);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Clean ALL tables in the public schema.
   * Useful for full-reset between test suites.
   */
  async cleanAll(): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'drizzle%'
      `);
      const tables = result.rows.map((r) => r.tablename);
      if (tables.length > 0) {
        const quoted = tables.map((t) => `"${t}"`).join(', ');
        await client.query(`TRUNCATE TABLE ${quoted} CASCADE`);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Tear down the database connection.
   * Call this in afterAll().
   */
  async teardown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this._db = null;
    }
  }
}

/**
 * Convenience factory for creating a test database instance.
 */
export function createTestDatabase(): TestDatabase {
  return new TestDatabase();
}
