import 'server-only';

import { headers } from 'next/headers';
import legacyApi from '@/legacy-api/api.js';
import { cacheGetJson, cacheSetJson } from '@/lib/redis';

function normalizeOrigin(proto: string, host: string) {
  const scheme = proto === 'http' ? 'http' : 'https';
  const cleanHost = host.split(',')[0]?.trim() || 'localhost';
  return `${scheme}://${cleanHost}`;
}

export async function requestOrigin() {
  try {
    const incoming = await headers();
    const host = incoming.get('x-forwarded-host') || incoming.get('host') || 'localhost';
    const proto = incoming.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return normalizeOrigin(proto, host);
  } catch {
    const configured = String(process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN || '').replace(
      /\/$/,
      '',
    );
    if (/^https?:\/\//.test(configured)) return configured;
    return 'http://localhost:3000';
  }
}

/**
 * Cache only public, cookie-independent compatibility reads.
 *
 * NOTE (Cloudflare Workers): the previous `'use cache'` + cacheLife/cacheTag
 * implementation hangs the Workers runtime (Next warns that Cache Components
 * cannot rely on this runtime's `setTimeout()`), so this is a short-TTL
 * in-process Map instead (no timers — entries expire lazily on read).
 * Warm isolates reuse it, which cuts repeat Supabase/legacy round trips
 * dramatically. Tenant isolation holds because the origin (host) is part
 * of the cache key. Mutations never go through here (POST /api only),
 * so worst case a public read is stale for TTL_MS.
 */
const TTL_MS = 60_000;
// งานอ่านแค็ตตาล็อกหนัก (สแกน/นับทั้งร้าน) ให้อยู่นานขึ้น — แอดมินแก้แล้วเห็นผลช้าสุด ~3 นาที
// แลกกับไม่ให้ทุก request จุด full scan จน worker ล้ม (1102)
const HEAVY_TTL_MS = 180_000;
const MAX_ENTRIES = 500;
const mem = new Map<string, { at: number; data: unknown }>();

function cacheKey(origin: string, action: string, params: Record<string, unknown>) {
  return `${origin}|${action}|${JSON.stringify(params)}`;
}
/**
 * The shopper's identity for the compatibility API's quotas.
 *
 * Server-rendered pages call the API from inside the Worker. Without the
 * visitor's address every shopper shared one "unknown" rate-limit bucket, so
 * once the catalogue quota was spent for the hour, product listings came back
 * empty for everyone. Forward the address Cloudflare vouches for, plus the
 * user agent the scraper check reads.
 */
async function visitorHeaders() {
  const out: Record<string, string> = { accept: 'application/json' };
  try {
    const incoming = await headers();
    for (const name of ['cf-connecting-ip', 'x-forwarded-for', 'user-agent']) {
      const value = incoming.get(name);
      if (value) out[name] = value;
    }
  } catch {
    // Outside a request (build, cron): no visitor to attribute.
  }
  return out;
}

async function cachedPublicRequest<T>(origin: string, action: string, params: Record<string, unknown>) {
  const query = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item));
    } else query.set(key, String(value));
  }

  const request = new Request(`${origin}/api?${query.toString()}`, {
    method: 'GET',
    headers: await visitorHeaders(),
  });
  const response = await legacyApi(request);
  const data = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
  if (!response.ok || data?.ok === false) {
    const error = new Error(String(data?.error || `http_${response.status}`));
    Object.assign(error, { status: response.status, data });
    throw error;
  }
  return data as T;
}

export async function safePublicLegacy<T>(
  action: string,
  params: Record<string, unknown> = {},
  fallback: T,
): Promise<T> {
  try {
    const origin = await requestOrigin();
    const key = cacheKey(origin, action, params);
    const ttl = action.startsWith('products.') ? HEAVY_TTL_MS : TTL_MS;
    const hit = mem.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data as T;
    const remoteHit = await cacheGetJson<T>(`tsk:public:${key}`);
    if (remoteHit !== null) {
      mem.set(key, { at: Date.now(), data: remoteHit });
      return remoteHit;
    }
    const out = await cachedPublicRequest<T>(origin, action, params);
    mem.set(key, { at: Date.now(), data: out });
    void cacheSetJson(`tsk:public:${key}`, out, Math.ceil(ttl / 1000));
    if (mem.size > MAX_ENTRIES) {
      const oldest = mem.keys().next();
      if (!oldest.done) mem.delete(oldest.value);
    }
    return out;
  } catch (error) {
    console.warn(`[next-cache] ${action} failed`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
