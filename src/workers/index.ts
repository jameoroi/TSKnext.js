import { Worker } from 'bullmq/dist/esm/classes/worker.js';
import sharp from 'sharp';
import { resendClient } from '@/lib/email';
import { logger } from '@/lib/logger';
import { getRedis } from '@/lib/redis';
import { PRODUCT_INDEX, searchClient } from '@/lib/search';
import { createDatabaseBackup, restoreDatabaseBackup } from './database-backup';

const connection = getRedis();
if (!connection) throw new Error('REDIS_URL is required to run workers');

const worker = new Worker(
  'tsk-jobs',
  async (job) => {
    logger.info({ job: job.name, id: job.id }, 'job.start');
    if (job.name === 'search.product.sync') {
      const client = searchClient();
      if (!client) throw new Error('meilisearch_not_configured');
      const rows = Array.isArray(job.data.products) ? job.data.products : [job.data.product].filter(Boolean);
      return client.index(PRODUCT_INDEX).addDocuments(rows, { primaryKey: 'id' });
    }
    if (job.name === 'image.optimize') {
      const input = Buffer.from(String(job.data.base64 || ''), 'base64');
      const output = await sharp(input)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 84 })
        .toBuffer();
      return { bytes: output.length, base64: output.toString('base64') };
    }
    if (job.name === 'email.order') {
      const resend = resendClient();
      if (!resend) throw new Error('resend_not_configured');
      return resend.emails.send({
        from: String(process.env.EMAIL_FROM || 'THAISERKIT <orders@example.com>'),
        to: [String(job.data.to)],
        subject: `คำสั่งซื้อ ${String(job.data.orderNo || '')}`,
        text: String(job.data.text || `เราได้รับคำสั่งซื้อ ${String(job.data.orderNo || '')} แล้ว`),
      });
    }
    if (job.name === 'maintenance.backup') {
      const backup = await createDatabaseBackup();
      const origin = String(process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
      const response = await fetch(`${origin}/api/cron/maintenance`, {
        method: 'POST',
        headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
      });
      if (!response.ok) throw new Error(`maintenance_${response.status}`);
      return { backup, maintenance: await response.json() };
    }
    if (job.name === 'maintenance.restore') {
      return restoreDatabaseBackup(String(job.data.key || ''));
    }
    throw new Error(`unknown_job:${job.name}`);
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 8) },
);

worker.on('completed', (job) => logger.info({ job: job.name, id: job.id }, 'job.complete'));
worker.on('failed', (job, error) => logger.error({ job: job?.name, id: job?.id, error }, 'job.failed'));
logger.info('THAISERKIT worker started');
