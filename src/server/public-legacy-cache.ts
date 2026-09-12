import 'server-only';

import { headers } from 'next/headers';
import legacyApi from '@/legacy-api/api.js';

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
    const configured = String(process.env.NEXT_PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN || '').replace(/\/$/, '');
    if (/^https?:\/\//.test(configured)) return configured;
    return 'http://localhost:3000';
  }
}

/**
 * Cache only public, cookie-independent compatibility reads.
 *
 * NOTE (Cloudflare Workers): the previous `'use cache'` + cacheLife/cacheTag
 * implementation hangs the Workers runtime (Next warns that Cache Components
 * cannot rely on this runtime's `setTimeout()`), so this is a direct
 * in-process call with no server cache. Tenant isolation still holds because
 * the origin (hence host) is passed per request, and client react-query
 * caches (`staleTime`) still apply in the browser.
 */
async function cachedPublicRequest<T>(origin: string, action: string, params: Record<string, unknown>) {
  const query = new URLSearchParams({ action });
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
    else query.set(key, String(value));
  }

  const request = new Request(`${origin}/api?${query.toString()}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
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
    const out = await cachedPublicRequest<T>(origin, action, params);
    return out;
  } catch (error) {
    console.warn(`[next-cache] ${action} failed`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
