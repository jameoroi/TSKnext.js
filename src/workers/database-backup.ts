import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

function required(name: string) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`backup_not_configured:${name}`);
  return value;
}

function runPgDump(output: string) {
  const binary = process.env.PG_DUMP_BIN || 'pg_dump';
  const databaseUrl = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('backup_not_configured:BACKUP_DATABASE_URL');
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      ['--format=custom', '--no-owner', '--no-privileges', '--file', output, databaseUrl],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump_failed:${code}:${stderr.slice(-1000)}`)),
    );
  });
}

export async function createDatabaseBackup() {
  const endpoint = required('BACKUP_S3_ENDPOINT');
  const bucket = required('BACKUP_S3_BUCKET');
  const accessKeyId = required('BACKUP_S3_ACCESS_KEY_ID');
  const secretAccessKey = required('BACKUP_S3_SECRET_ACCESS_KEY');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'thaiserkit-backup-'));
  const file = path.join(directory, 'database.dump');
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const prefix = String(process.env.BACKUP_S3_PREFIX || 'postgres').replace(/^\/+|\/+$/g, '');
  const key = `${prefix}/${stamp}.dump`;
  try {
    await runPgDump(file);
    const size = (await stat(file)).size;
    const client = new S3Client({
      endpoint,
      region: process.env.BACKUP_S3_REGION || 'auto',
      forcePathStyle:
        process.env.BACKUP_S3_FORCE_PATH_STYLE === '1' || process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(file),
        ContentType: 'application/octet-stream',
        Metadata: { source: 'thaiserkit-next', createdAt: new Date().toISOString() },
      }),
    );
    return { ok: true, bucket, key, bytes: size };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function restoreDatabaseBackup(key: string) {
  const endpoint = required('BACKUP_S3_ENDPOINT');
  const bucket = required('BACKUP_S3_BUCKET');
  const accessKeyId = required('BACKUP_S3_ACCESS_KEY_ID');
  const secretAccessKey = required('BACKUP_S3_SECRET_ACCESS_KEY');
  const databaseUrl = required('RESTORE_DATABASE_URL');
  const cleanKey = String(key || '').replace(/^\/+/, '');
  if (!cleanKey || cleanKey.includes('..') || cleanKey.length > 512) throw new Error('invalid_backup_key');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'thaiserkit-restore-'));
  const file = path.join(directory, 'database.dump');
  const client = new S3Client({
    endpoint,
    region: process.env.BACKUP_S3_REGION || 'auto',
    forcePathStyle:
      process.env.BACKUP_S3_FORCE_PATH_STYLE === '1' || process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: cleanKey }));
    if (!object.Body) throw new Error('backup_object_empty');
    await pipeline(Readable.fromWeb(object.Body as unknown as NodeReadableStream), createWriteStream(file));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.env.PG_RESTORE_BIN || 'pg_restore',
        ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', databaseUrl, file],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`pg_restore_failed:${code}:${stderr.slice(-1000)}`)),
      );
    });
    return { ok: true, bucket, key: cleanKey };
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
