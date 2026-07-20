/**
 * Minimal migration runner — reads SQL files from migrations folder
 * and applies them in order, tracking applied migrations in __drizzle_migrations table.
 * No drizzle-kit dependency needed.
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'src', 'drizzle', 'migrations');

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  // Ensure migrations tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  // Get already applied migrations
  const applied = await client.query('SELECT hash FROM "__drizzle_migrations"');
  const appliedHashes = new Set(applied.rows.map((r) => r.hash));

  // Read migration files
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(sql).digest('hex');

    if (appliedHashes.has(hash)) {
      continue; // Already applied
    }

    console.log(`  → Applying: ${file}`);
    try {
      await client.query(sql);
      await client.query('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)', [
        hash,
        Date.now(),
      ]);
      appliedCount++;
    } catch (err) {
      console.error(`❌ Failed on ${file}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  if (appliedCount === 0) {
    console.log('✅ No new migrations to apply');
  } else {
    console.log(`✅ Applied ${appliedCount} migration(s)`);
  }

  await client.end();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
