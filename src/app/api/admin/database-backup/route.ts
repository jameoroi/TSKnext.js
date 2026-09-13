import { z } from 'zod';
import { getLegacySession } from '@/server/auth/legacy-session';
import { enqueue } from '@/server/queue';

const schema = z.object({ operation: z.enum(['backup', 'restore']), key: z.string().trim().max(512).optional(), csrf: z.string().min(8).max(500) });

export async function GET() {
  const session = await getLegacySession();
  if (!session.admin) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return Response.json({ ok: true, configured: Boolean(process.env.BACKUP_S3_ENDPOINT && process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY && (process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL)), worker: 'maintenance.backup', restoreWorker: 'maintenance.restore' });
}

export async function POST(request: Request) {
  const session = await getLegacySession();
  if (!session.admin) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success || body.data.csrf !== String(session.csrf || '')) return Response.json({ ok: false, error: 'invalid_csrf' }, { status: 403 });
  if (body.data.operation === 'restore' && !body.data.key) return Response.json({ ok: false, error: 'backup_key_required' }, { status: 422 });
  const result = await enqueue(body.data.operation === 'backup' ? 'maintenance.backup' : 'maintenance.restore', body.data.operation === 'restore' ? { key: body.data.key } : { requestedBy: String(session.admin.username || '') });
  return Response.json({ ok: result.queued, ...result }, { status: result.queued ? 202 : 503 });
}
