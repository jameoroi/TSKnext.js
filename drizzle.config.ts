import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set; drizzle commands will need it.');

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './database/generated',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
