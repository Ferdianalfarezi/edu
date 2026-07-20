/** @type {import('drizzle-kit').Config} */
export default {
  out: './src/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
