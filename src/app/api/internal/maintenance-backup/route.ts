import { runBackupJob } from '@/legacy-api/maintenance.js';

type BackupJobRequest = {
  day?: unknown;
  job_token?: unknown;
  tenant_id?: unknown;
};

export async function POST(request: Request) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return Response.json({ ok: false, error: 'cron_not_configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${expected}`)
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as BackupJobRequest | null;
  const day = String(body?.day || '');
  const jobToken = String(body?.job_token || '');
  const tenantId = String(body?.tenant_id || '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^[a-f0-9]{48}$/.test(jobToken) ||
    !/^[a-z0-9-]{1,80}$/.test(tenantId)
  ) {
    return Response.json({ ok: false, error: 'invalid_backup_job' }, { status: 422 });
  }

  try {
    const manifest = await runBackupJob({ day, jobToken, tenantId });
    return Response.json({ ok: true, manifest }, { status: 200 });
  } catch (error) {
    console.warn(
      'maintenance backup failed',
      tenantId,
      error instanceof Error ? error.message : 'unknown_error',
    );
    return Response.json({ ok: false, error: 'backup_failed' }, { status: 500 });
  }
}
