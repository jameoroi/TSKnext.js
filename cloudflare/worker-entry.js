/**
 * Worker entry in front of the OpenNext handler.
 *
 * The shop runs on Cloudflare Workers Free, which allows about 10 ms of CPU per
 * request. Rendering a Next.js page costs more than that, so a busy isolate hit
 * "error code: 1102" even after the catalogue work was cut down. Anonymous
 * visitors all receive the same HTML (sessions, cart and wishlist load in the
 * browser), so public pages and the settings/image API reads every page makes
 * are answered from the colo's Cache API. A cached answer costs well under a
 * millisecond; the render only runs when an entry is missing or stale, and a
 * stale entry is still served while it refreshes in the background.
 *
 * Two layers keep the shop up when renders fail:
 * - the colo Cache API (fast, but per colo and evictable), serving stale for a day;
 * - a last-good copy in R2 (PRODUCT_MEDIA, under `_edge/`, which /media refuses),
 *   used when a colo has no entry yet, so a cold colo does not have to render.
 * The cache key only includes query parameters a page reads (edge-cache-key.mjs).
 */
import openNext from '../.open-next/worker.js';
import { SECURITY_HEADERS } from '../src/shared/security-headers.mjs';
import { cacheable, cacheKeyUrl, lastGoodObjectKey } from './edge-cache-key.mjs';

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from '../.open-next/worker.js';

const FRESH_SECONDS = 60;
// Serve a stale entry for up to a day while it refreshes: a failed refresh
// (1102) must not turn into an outage once a page has rendered once.
const STALE_SECONDS = 24 * 60 * 60;
// A last-good copy older than this is not served; the render is tried instead.
const LAST_GOOD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Refresh the R2 copy at most this often per page, to stay well inside R2's free writes.
const LAST_GOOD_WRITE_EVERY_MS = 5 * 60 * 1000;
const STORED_AT = 'x-tsk-edge-stored-at';

function storable(response) {
  if (response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;
  const type = response.headers.get('content-type') || '';
  return (
    type.includes('text/html') ||
    type.includes('application/json') ||
    type.includes('xml') ||
    type.startsWith('text/plain') ||
    type.startsWith('image/')
  );
}

// Streamed pages keep status 200 even when they end in notFound() or an error
// boundary, and a failed API read still answers 200 with ok:false. Neither may be
// cached, or one bad moment would be served to every visitor for minutes.
// A rendered not-found page (e.g. an unknown product slug) carries no error
// marker, but it is the only cacheable page marked noindex, so that marks it.
const BROKEN_HTML =
  /NEXT_HTTP_ERROR_FALLBACK|NEXT_REDIRECT|โหลดข้อมูลสินค้าไม่สำเร็จ|error code: 110\d|<meta name="robots" content="noindex/;
async function healthy(response) {
  const type = response.headers.get('content-type') || '';
  if (type.startsWith('image/')) return true;
  const text = await response.clone().text();
  if (type.includes('application/json')) return !/"ok"\s*:\s*false/.test(text);
  if (type.includes('xml')) return /<(urlset|sitemapindex)\b/.test(text);
  if (type.startsWith('text/plain')) return text.length > 0 && !/error code: 110\d/.test(text);
  return !BROKEN_HTML.test(text);
}

async function store(cache, key, response) {
  if (!(await healthy(response))) return false;
  const headers = new Headers(response.headers);
  headers.set(STORED_AT, String(Date.now()));
  // The Cache API honours cache-control; the freshness decision is made above.
  headers.set('cache-control', `public, max-age=${FRESH_SECONDS + STALE_SECONDS}`);
  await cache.put(key, new Response(response.body, { status: response.status, headers }));
  return true;
}

async function storeLastGood(bucket, objectKey, response) {
  if (!bucket) return;
  const head = await bucket.head(objectKey).catch(() => null);
  const storedAt = Number(head?.customMetadata?.storedAt || 0);
  if (head && Date.now() - storedAt < LAST_GOOD_WRITE_EVERY_MS) return;
  await bucket.put(objectKey, await response.arrayBuffer(), {
    httpMetadata: { contentType: response.headers.get('content-type') || 'text/html; charset=utf-8' },
    customMetadata: { storedAt: String(Date.now()) },
  });
}

async function readLastGood(bucket, objectKey) {
  if (!bucket) return null;
  const object = await bucket.get(objectKey).catch(() => null);
  if (!object) return null;
  const storedAt = Number(object.customMetadata?.storedAt || 0);
  if (!storedAt || Date.now() - storedAt > LAST_GOOD_MAX_AGE_MS) return null;
  const headers = new Headers(SECURITY_HEADERS);
  headers.set('content-type', object.httpMetadata?.contentType || 'text/html; charset=utf-8');
  headers.set(STORED_AT, String(storedAt));
  return new Response(object.body, { status: 200, headers });
}

function forVisitor(cached, state) {
  const headers = new Headers(cached.headers);
  headers.delete(STORED_AT);
  headers.set('cache-control', 'private, no-cache');
  headers.set('x-tsk-edge-cache', state);
  return new Response(cached.body, { status: cached.status, headers });
}

/** Render in the background and refresh both cache layers when the render is healthy. */
function refresh(request, url, env, ctx, cache, key, objectKey) {
  return openNext
    .fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env, ctx)
    .then(async (fresh) => {
      if (!storable(fresh)) return;
      const copy = fresh.clone();
      if (await store(cache, key, fresh)) await storeLastGood(env.PRODUCT_MEDIA, objectKey, copy);
    })
    .catch(() => undefined);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = globalThis.caches?.default;
    if (!cache || !cacheable(request, url)) return openNext.fetch(request, env, ctx);

    const keyUrl = cacheKeyUrl(url);
    const key = new Request(keyUrl.toString(), { method: 'GET' });
    const objectKey = await lastGoodObjectKey(keyUrl);
    const cached = await cache.match(key).catch(() => undefined);
    if (cached) {
      const age = (Date.now() - Number(cached.headers.get(STORED_AT) || 0)) / 1000;
      if (age < FRESH_SECONDS) return forVisitor(cached, 'HIT');
      if (age < FRESH_SECONDS + STALE_SECONDS) {
        ctx.waitUntil(refresh(request, url, env, ctx, cache, key, objectKey));
        return forVisitor(cached, 'STALE');
      }
    }

    // Nothing usable in this colo: answer with the last-good copy if there is one,
    // seed the colo cache with it, and render in the background.
    const lastGood = await readLastGood(env.PRODUCT_MEDIA, objectKey);
    if (lastGood) {
      const seeded = lastGood.clone();
      ctx.waitUntil(
        cache
          .put(key, new Response(seeded.body, { status: 200, headers: seeded.headers }))
          .catch(() => undefined)
          .then(() => refresh(request, url, env, ctx, cache, key, objectKey)),
      );
      return forVisitor(lastGood, 'R2');
    }

    const response = await openNext.fetch(request, env, ctx);
    if (!storable(response)) return response;
    const forCache = response.clone();
    const forR2 = response.clone();
    ctx.waitUntil(
      store(cache, key, forCache)
        .then((ok) => (ok ? storeLastGood(env.PRODUCT_MEDIA, objectKey, forR2) : undefined))
        .catch(() => undefined),
    );
    const headers = new Headers(response.headers);
    headers.set('x-tsk-edge-cache', 'MISS');
    return new Response(response.body, { status: response.status, headers });
  },
};
