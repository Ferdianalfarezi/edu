import { Client } from 'pg';

/**
 * Global test setup - runs once before all integration test suites.
 * Creates the test database if it doesn't exist and applies migrations.
 */
export default async function globalSetup() {
  const dbName = process.env.TEST_DB_NAME || 'edu_test';
  const connectionString =
    process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Check if test database exists
    const result = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);

    if (result.rowCount === 0) {
      // Terminate existing connections and create fresh DB
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Test database "${dbName}" created.`);
    }
  } catch (error) {
    // Database might already exist — that's fine
    if ((error as any).code !== '42P04') {
      throw error;
    }
  } finally {
    await client.end();
  }
}
