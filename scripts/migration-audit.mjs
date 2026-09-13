import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const directory = path.join(root, 'database', 'migrations');
const files = fs
  .readdirSync(directory)
  .filter((file) => file.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b));
const problems = [];
const timestamps = new Set();
let previous = '';

for (const file of files) {
  const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) {
    problems.push(`${file}: filename must start with a 14-digit timestamp and a safe slug`);
    continue;
  }
  const timestamp = match[1];
  if (timestamps.has(timestamp)) problems.push(`${file}: duplicate migration timestamp ${timestamp}`);
  timestamps.add(timestamp);
  if (previous && timestamp <= previous) problems.push(`${file}: migration order is not strictly increasing`);
  previous = timestamp;
  const sql = fs.readFileSync(path.join(directory, file), 'utf8').trim();
  if (!sql) problems.push(`${file}: migration is empty`);
}

if (!files.length) problems.push('database/migrations: no SQL migrations found');
console.log(`Migration audit: ${files.length} SQL file(s)`);
if (problems.length) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('Migration audit passed');
