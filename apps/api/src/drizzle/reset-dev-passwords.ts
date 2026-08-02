/**
 * Dev utility: Reset all staff user passwords to 'password123'
 *
 * Targets all non-orang_tua users in the dev database.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/drizzle/reset-dev-passwords.ts
 */

import { Client } from 'pg';
import * as bcrypt from 'bcrypt';

async function resetDevPasswords() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('This script must NOT be run in production');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('🔑 Hashing password123...');
  const hash = await bcrypt.hash('password123', 10);

  const result = await client.query(
    `UPDATE "user"
     SET password_hash = $1, must_change_password = false, updated_at = NOW()
     WHERE role != 'orang_tua'`,
    [hash],
  );

  console.log(`✅ Reset ${result.rowCount} user passwords to 'password123'`);

  await client.end();
}

resetDevPasswords().catch((e) => {
  console.error('❌ Failed:', e.message);
  process.exit(1);
});
