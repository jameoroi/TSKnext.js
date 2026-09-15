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
 * The cache key only includes query parameters a page reads (edge-cache-key.mjs),
 * plus the deployment id, so a new deploy never serves HTML from the old build.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import openNext from '../.open-next/worker.js';
import { SECURITY_HEADERS } from '../src/shared/security-headers.mjs';
import {
  cacheable,
  cacheKeyUrl,
  lastGoodObjectKey,
  staticAssetPaths,
  versionedKey,
} from './edge-cache-key.mjs';

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

// Workers Free allows 50 subrequests per invocation. Count them per request, by
// service domain only (never the full host, path or query), so a MISS response
// shows which service used the budget.
const subrequests = new AsyncLocalStorage();
const baseFetch = globalThis.fetch;
globalThis.fetch = function countedFetch(input, init) {
  const tally = subrequests.getStore();
  if (tally) {
    let domain = 'other';
    try {
      domain = new URL(typeof input === 'string' ? input : input.url).hostname.split('.').slice(-2).join('.');
    } catch {}
    tally[domain] = (tally[domain] || 0) + 1;
  }
  return baseFetch.call(this, input, init);
};
const tallyText = (tally) =>
  Object.entries(tally)
    .map(([domain, count]) => `${domain}=${count}`)
    .join(',') || 'none';

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

async function storeLastGood(bucket, objectKey, response, build) {
  if (!bucket) return;
  const head = await bucket.head(objectKey).catch(() => null);
  const storedAt = Number(head?.customMetadata?.storedAt || 0);
  const sameBuild = (head?.customMetadata?.build || '') === (build || '');
  // A copy from an older build is replaced as soon as this build renders the page.
  if (head && sameBuild && Date.now() - storedAt < LAST_GOOD_WRITE_EVERY_MS) return;
  await bucket.put(objectKey, await response.arrayBuffer(), {
    httpMetadata: { contentType: response.headers.get('content-type') || 'text/html; charset=utf-8' },
    customMetadata: { storedAt: String(Date.now()), build: build || '' },
  });
}

/**
 * Last-good copies outlive deploys. A copy from this build is served as is; a copy
 * from an earlier build only when every /_next/static asset it loads still exists
 * in this deploy (content-hashed names), otherwise the page would not hydrate.
 */
async function readLastGood(bucket, objectKey, env, url) {
  if (!bucket) return null;
  const object = await bucket.get(objectKey).catch(() => null);
  if (!object) return null;
  const storedAt = Number(object.customMetadata?.storedAt || 0);
  if (!storedAt || Date.now() - storedAt > LAST_GOOD_MAX_AGE_MS) return null;
  const type = object.httpMetadata?.contentType || 'text/html; charset=utf-8';
  const build = env.CF_VERSION_METADATA?.id || '';
  let body = object.body;
  if ((object.customMetadata?.build || '') !== build && type.includes('text/html')) {
    if (!env.ASSETS) return null;
    const html = await object.text();
    const paths = staticAssetPaths(html);
    const checks = await Promise.all(
      paths.map((path) =>
        env.ASSETS.fetch(new Request(new URL(path, url.origin).toString(), { method: 'HEAD' }))
          .then((res) => res.ok)
          .catch(() => false),
      ),
    );
    if (checks.includes(false)) return null;
    body = html;
  }
  const headers = new Headers(SECURITY_HEADERS);
  headers.set('content-type', type);
  headers.set(STORED_AT, String(storedAt));
  return new Response(body, { status: 200, headers });
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
      if (await store(cache, key, fresh))
        await storeLastGood(env.PRODUCT_MEDIA, objectKey, copy, env.CF_VERSION_METADATA?.id);
    })
    .catch(() => undefined);
}

export default {
  fetch(request, env, ctx) {
    return subrequests.run({}, () => handle(request, env, ctx));
  },
};

async function handle(request, env, ctx) {
  {
    const url = new URL(request.url);
    const cache = globalThis.caches?.default;
    if (!cache || !cacheable(request, url)) return openNext.fetch(request, env, ctx);

    // Scoped to this deployment: HTML from a previous build references
    // /_next/static chunks that the new deploy removed (404, no hydration).
    const pageUrl = cacheKeyUrl(url);
    const keyUrl = versionedKey(pageUrl, env.CF_VERSION_METADATA?.id);
    const key = new Request(keyUrl.toString(), { method: 'GET' });
    // The R2 copy is keyed by page only, so it survives deploys (see readLastGood).
    const objectKey = await lastGoodObjectKey(pageUrl);
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
    const lastGood = await readLastGood(env.PRODUCT_MEDIA, objectKey, env, url);
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
    const type = response.headers.get('content-type') || '';
    if (type.includes('text/html')) {
      // Store the page before answering. The home page render runs close to the
      // CPU limit, and a store left to waitUntil was cut off with the invocation,
      // so the page was never cached and every visitor paid for a full render.
      const html = await response.text();
      const copy = () => new Response(html, { status: response.status, headers: response.headers });
      let storeState = 'ok';
      const stored = await store(cache, key, copy())
        .then((ok) => {
          if (!ok) storeState = 'unhealthy';
          return ok;
        })
        .catch((error) => {
          storeState = `error:${String(error?.message || error).slice(0, 80)}`;
          return false;
        });
      if (stored) {
        ctx.waitUntil(
          storeLastGood(env.PRODUCT_MEDIA, objectKey, copy(), env.CF_VERSION_METADATA?.id).catch(
            () => undefined,
          ),
        );
      }
      const htmlHeaders = new Headers(response.headers);
      htmlHeaders.set('x-tsk-edge-cache', 'MISS');
      // Why a render did not land in the cache (ok | unhealthy | error:...); no secrets involved.
      htmlHeaders.set('x-tsk-edge-store', storeState);
      htmlHeaders.set('x-tsk-subrequests', tallyText(subrequests.getStore() || {}));
      return new Response(html, { status: response.status, headers: htmlHeaders });
    }
    const forCache = response.clone();
    const forR2 = response.clone();
    ctx.waitUntil(
      store(cache, key, forCache)
        .then((ok) =>
          ok ? storeLastGood(env.PRODUCT_MEDIA, objectKey, forR2, env.CF_VERSION_METADATA?.id) : undefined,
        )
        .catch(() => undefined),
    );
    const headers = new Headers(response.headers);
    headers.set('x-tsk-edge-cache', 'MISS');
    return new Response(response.body, { status: response.status, headers });
  }
}
