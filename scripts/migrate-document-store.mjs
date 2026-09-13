import process from 'node:process';

const dryRun = process.argv.includes('--dry-run');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required; no document-store migration was run');
  process.exit(1);
}

console.log(`${dryRun ? '[dry-run] ' : ''}Document-store migration plan only.`);
console.log('Source: app_kv namespaces ending in -data and auth/session compatibility keys.');
console.log('Targets: site_settings, content_entries, and expiring auth session storage.');
console.log('Refusing automatic backfill until the tenant/content field mapping is reviewed by a human.');
if (!dryRun) process.exitCode = 2;
