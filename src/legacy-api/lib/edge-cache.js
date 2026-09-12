/**
 * The shop's own edge cache, held in the Worker rather than in a dashboard.
 *
 * Every public read this API serves goes to Supabase in Singapore and waits
 * 650–780 ms for it, measured against production. The responses already carry
 * the right `Cache-Control` — `products.list` says `public, max-age=30,
 * stale-while-revalidate=300` — and none of it has ever been honoured: a live
 * check of that endpoint returns no `cf-cache-status` header at all, because
 * Cloudflare does not cache a Worker's response on the strength of its headers.
 * It caches what a Cache Rule tells it to, and that rule lives in a dashboard
 * no file in this repository can see, test, or restore.
 *
 * So the Worker keeps its own. `caches.default` is the same storage the Cache
 * Rule would have used, it is free, it needs no binding and no configuration,
 * and it is per-colo — the shopper in Bangkok warms the copy the next shopper
 * in Bangkok reads. A hit costs no Supabase round trip at all.
 *
 * What is deliberately *not* cached:
 *   - anything but GET, because a write is not a read;
 *   - any action outside the list below, which is the same set of public reads
 *     `server/api/index.ts` already treats as safe to answer from a public
 *     origin;
 *   - any response that carries `set-cookie`, which would hand one shopper's
 *     cookie to the next one. `partner.store` and `partner.resolve` are the
 *     reason that check exists rather than being theoretical: both answer with
 *     the attribution cookie that decides whose commission a sale is;
 *   - any response that is not a 200, so an outage is never cached over the
 *     recovery.
 *
 * Everything here degrades to nothing. `caches` does not exist under Node, so
 * the test suite and any local run simply pass straight through.
 */

/** Public reads whose answer is the same for every shopper. */
const CACHEABLE = new Set([
  'site.settings',
  'categories.list',
  'brands.list',
  'products.list',
  'products.get',
  'products.recommend',
  'products.recommend.legacy',
  'reviews.list',
  'content.list',
  'chat.availability',
]);

/** True where the runtime gives us a cache to use. */
function edgeCacheAvailable() {
  return typeof caches !== 'undefined' && Boolean(caches?.default);
}

/**
 * The key a request is cached under.
 *
 * The full URL, which already carries the host — so two merchants on two
 * domains can never read each other's catalogue out of one entry — and the
 * query string, so a page of products is not confused with another page of
 * them. The branch is folded in because preview deployments share this cache
 * with production and must not answer for it.
 */
function cacheKey(req) {
  const url = new URL(req.url);
  const branch = String(process.env.CF_PAGES_BRANCH || 'local');
  url.searchParams.set('__branch', branch);
  return new Request(url.toString(), { method: 'GET' });
}

/** The cached answer, or null. Never throws. */
export async function edgeCacheMatch(req, action) {
  if (!edgeCacheAvailable() || req.method !== 'GET' || !CACHEABLE.has(action)) return null;
  try {
    const hit = await caches.default.match(cacheKey(req));
    if (!hit) return null;
    // Say so on the way out. Without this a hit and a miss are indistinguishable
    // from outside, which is how the Cache Rule went unnoticed for as long as it
    // did.
    const headers = new Headers(hit.headers);
    headers.set('x-tsk-edge-cache', 'HIT');
    return new Response(hit.body, { status: hit.status, headers });
  } catch {
    return null;
  }
}

/**
 * Store an answer, when it is one that may be shared.
 *
 * The response is cloned because the caller still has to send it, and a body
 * can only be read once.
 */
export async function edgeCachePut(req, action, response) {
  if (!edgeCacheAvailable() || req.method !== 'GET' || !CACHEABLE.has(action)) return response;
  try {
    if (response.status !== 200) return response;
    if (response.headers.get('set-cookie')) return response;
    const control = response.headers.get('cache-control') || '';
    if (!/public/i.test(control) || /no-store|private/i.test(control)) return response;
    await caches.default.put(cacheKey(req), response.clone());
  } catch {
    // A cache that cannot be written to is not a reason to fail the request.
  }
  const headers = new Headers(response.headers);
  headers.set('x-tsk-edge-cache', 'MISS');
  return new Response(response.body, { status: response.status, headers });
}
