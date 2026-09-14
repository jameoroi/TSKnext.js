import { NextResponse } from 'next/server';
import { presignS3Url } from '@/legacy-api/lib/s3-presign.js';
import { isMediaKey } from '@/shared/media-key.mjs';

function encodedPath(key: string) {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function fromSupabase(key: string) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const secret = String(process.env.SUPABASE_SECRET_KEY || '');
  const bucket = String(process.env.SUPABASE_MEDIA_BUCKET || 'product-media');
  if (!base || !secret || !bucket) return null;
  const upstream = await fetch(
    `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(key)}`,
    {
      headers: {
        apikey: secret,
        authorization: `Bearer ${secret}`,
      },
      redirect: 'follow',
    },
  );
  return upstream;
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = (parts || []).join('/').replace(/^\/+/, '');
  if (!isMediaKey(key)) return NextResponse.json({ ok: false, error: 'bad_media_key' }, { status: 400 });

  const endpoint = String(process.env.MEDIA_S3_ENDPOINT || process.env.S3_ENDPOINT || '').replace(/\/$/, '');
  const bucket = String(process.env.MEDIA_BUCKET || process.env.S3_BUCKET || '');
  const accessKeyId = String(process.env.MEDIA_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '');
  const secretAccessKey = String(
    process.env.MEDIA_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '',
  );

  let upstream: Response | null = null;
  if (endpoint && bucket && accessKeyId && secretAccessKey) {
    const signed = await presignS3Url({
      endpoint,
      bucket,
      key,
      method: 'GET',
      region: process.env.MEDIA_S3_REGION || process.env.S3_REGION || 'auto',
      accessKeyId,
      secretAccessKey,
      expiresIn: 300,
      forcePathStyle:
        String(
          process.env.MEDIA_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE || '1',
        ).toLowerCase() !== 'false',
    });
    upstream = await fetch(signed, { redirect: 'follow' });
  } else {
    upstream = await fromSupabase(key);
  }

  if (!upstream)
    return NextResponse.json({ ok: false, error: 'media_storage_not_configured' }, { status: 503 });
  if (!upstream.ok)
    return NextResponse.json(
      { ok: false, error: upstream.status === 404 ? 'not_found' : 'media_upstream_error' },
      { status: upstream.status === 404 ? 404 : 502 },
    );

  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  return new Response(await upstream.arrayBuffer(), { status: 200, headers });
}
