import maintenance from '@/legacy-api/maintenance.js';

export async function POST(request: Request) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return Response.json({ ok: false, error: 'cron_not_configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return maintenance(request);
}

export const GET = POST;
