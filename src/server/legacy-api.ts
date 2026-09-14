import 'server-only';
import { headers } from 'next/headers';
import legacyApi from '@/legacy-api/api.js';

export async function serverLegacyRequest<T>(
  action: string,
  params: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'GET',
) {
  const incoming = await headers();
  // Validated Host first (see requestHostname in server/request-tenant.ts):
  // x-forwarded-host is client-spoofable on direct origin hits.
  const host = incoming.get('host') || incoming.get('x-forwarded-host') || 'localhost';
  const proto = incoming.get('x-forwarded-proto') || 'https';
  const h = new Headers();
  const cookie = incoming.get('cookie');
  if (cookie) h.set('cookie', cookie);
  h.set('accept', 'application/json');
  let url = `${proto}://${host}/api?action=${encodeURIComponent(action)}`;
  const init: RequestInit = { method, headers: h };
  if (method === 'GET') {
    const q = new URLSearchParams({ action });
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => q.append(key, String(v)));
      else q.set(key, String(value));
    }
    url = `${proto}://${host}/api?${q}`;
  } else {
    h.set('content-type', 'application/json');
    init.body = JSON.stringify({ action, ...params });
  }
  const response = await legacyApi(new Request(url, init));
  const data = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
  if (!response.ok || data?.ok === false) {
    const error = new Error(String(data?.error || `http_${response.status}`));
    Object.assign(error, { status: response.status, data });
    throw error;
  }
  return data as T;
}
