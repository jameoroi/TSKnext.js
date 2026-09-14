import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.error('DATABASE_URL is required for db:migrate');
  process.exit(1);
}

const migrationsDir = path.resolve(process.cwd(), 'database/migrations');
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  onnotice:
    process.env.MIGRATION_VERBOSE === '1' ? (notice) => console.log('[postgres]', notice.message) : undefined,
});

function checksum(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function ensureLedger() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function run() {
  const names = (await readdir(migrationsDir))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));

  if (!names.length) throw new Error(`No SQL migrations found in ${migrationsDir}`);
  await ensureLedger();

  const applied = await sql`SELECT name, checksum FROM app_schema_migrations ORDER BY name`;
  const byName = new Map(applied.map((row) => [String(row.name), String(row.checksum)]));

  let changed = 0;
  for (const name of names) {
    const filePath = path.join(migrationsDir, name);
    const body = await readFile(filePath, 'utf8');
    const digest = checksum(body);
    const previous = byName.get(name);

    if (previous) {
      if (previous !== digest) {
        throw new Error(
          `Migration checksum mismatch: ${name}. Never edit an already-applied migration; add a new migration instead.`,
        );
      }
      console.log(`✓ ${name} (already applied)`);
      continue;
    }

    console.log(`→ ${name}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        INSERT INTO app_schema_migrations (name, checksum)
        VALUES (${name}, ${digest})
      `;
    });
    console.log(`✓ ${name}`);
    changed += 1;
  }

  console.log(changed ? `Applied ${changed} migration(s).` : 'Database is already up to date.');
}

try {
  await run();
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
