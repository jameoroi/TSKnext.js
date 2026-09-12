import maintenance from '@/legacy-api/maintenance.js';

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return maintenance(request);
}

export const GET = POST;
