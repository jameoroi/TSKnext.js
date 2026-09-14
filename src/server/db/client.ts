import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('database_not_configured');
  const client = postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    connection: { search_path: 'public, extensions' },
  });
  return { client, db: drizzle(client, { schema }) };
}

export async function withDb<T>(run: (db: Db) => Promise<T>): Promise<T> {
  const { client, db } = connect();
  try {
    return await run(db);
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

export function openDb() {
  return connect();
}
