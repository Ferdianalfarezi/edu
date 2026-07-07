import { Client } from 'pg';

/**
 * Global test teardown - runs once after all integration test suites.
 * Drops the test database to ensure clean slate for next run.
 */
export default async function globalTeardown() {
  const dbName = process.env.TEST_DB_NAME || 'edu_test';
  const connectionString =
    process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Terminate all connections to the test database
    await client.query(
      `
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `,
      [dbName],
    );

    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`Test database "${dbName}" dropped.`);
  } catch (error) {
    console.warn(`Warning: Could not drop test database "${dbName}":`, error);
  } finally {
    await client.end();
  }
}
