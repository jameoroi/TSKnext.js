/**
 * The shop's own edge cache for rendered pages.
 *
 * `api/lib/edge-cache.js` did this for the API and explains the reasoning at
 * length: the responses already carry the right `Cache-Control`, Cloudflare
 * does not cache a Worker's response on the strength of its headers, and the
 * Cache Rule that would make it do so lives in a dashboard no file in this
 * repository can see, test or restore. `caches.default` is the same storage
 * that rule would have used, it is free, it needs no binding, and it is
 * per-colo — the shopper in Bangkok warms the copy the next shopper in Bangkok
 * reads.
 *
 * That left HTML. `nuxt.config.ts` marks twelve routes `edgeCache(n)` and every
 * one of them has been rendering from scratch on every request since the rule
 * was written — no error, no warning, and `?action=health` cheerfully green
 * throughout. Every 1102 and every 524 this shop has measured happened on a
 * cold render, and the commonest cold render is not an unlucky first visitor:
 * it is somebody arriving from a Facebook post with `?fbclid=…` on the end,
 * which is a URL the edge has never seen and never will see twice.
 *
 * ## What is deliberately not cached
 *
 * A page cache is the one cache where a mistake hands one shopper another
 * shopper's screen, so every condition here is a refusal rather than a
 * precaution:
 *
 *   - anything but GET;
 *   - any path not on ALLOWED below, which is exactly the set nuxt.config.ts
 *     already declares safe to hold at the edge — the pages whose server output
 *     is the same bytes for everybody, with the cart, the wishlist and the
 *     signed-in state filled in by the browser afterwards;
 *   - any request carrying a session or attribution cookie. Those pages are
 *     supposed to render identically for a signed-in shopper, and "supposed to"
 *     is not the standard a shared cache should be held to;
 *   - any response that is not a 200, so an outage is never cached over the
 *     recovery;
 *   - any response carrying `set-cookie`, which would hand one shopper's cookie
 *     to the next one;
 *   - anything that is not HTML.
 *
 * ## Why the query string is dropped rather than kept
 *
 * Keying on the full URL means `?fbclid=abc` and `?fbclid=def` are two entries
 * and neither is ever read twice — the cache would fill with single-use copies
 * and the cold render it exists to prevent would still happen every time. So
 * tracking parameters are stripped from the key, because they do not change a
 * single byte of what is rendered.
 *
 * Anything left after that stripping is treated as meaningful and the request
 * is not cached at all. `/products?category=…` renders a different page and
 * must not be served the unfiltered one; refusing is the safe half of that
 * choice, and the pages people actually arrive on carry no other parameters.
 */

/** Exactly the routes nuxt.config.ts holds at the edge. */
const ALLOWED = new Set([
  '/', '/products', '/brands', '/about', '/contact',
  '/terms', '/privacy', '/returns', '/partners', '/news', '/videos',
]);

/** `/products/<slug>` as well, which is the same rule written as a glob there. */
const ALLOWED_PREFIX = '/products/';

/**
 * Parameters that identify where a visitor came from and change nothing about
 * what they are shown.
 */
const TRACKING = /^(fbclid|gclid|dclid|ttclid|msclkid|igshid|mc_cid|mc_eid|_gl|utm_[a-z_]+|health)$/i;

/**
 * Filters that may be cached, and the shape each one is allowed to take.
 *
 * Every query string was refused, which meant `/products?category=pump` — one
 * click on the front page — was rendered from nothing on every visit. Measured
 * on production: **1.93 seconds**, against 0.13 for the same listing unfiltered
 * and cached. A shopper browsing five categories paid that five times.
 *
 * These four are public, identical for every visitor, and drawn from a set the
 * shop itself defines, so one stored copy answers everybody. What is *not* here
 * matters as much:
 *
 *   q                  free text. Unbounded, so the cache would fill with
 *                      single-use entries and the cold render it exists to
 *                      prevent would still happen every time. The listing does
 *                      not even render a search on the server (see
 *                      `server: !route.query.q` in products/index.vue).
 *   min_price/max_price  two free numbers, so the same objection, squared.
 *
 * The patterns are as tight as the values they admit. A key is a path in a
 * shared cache, and "anything" is not a value — a parameter that accepted
 * arbitrary text would let one visitor write as many entries as they liked.
 */
const CACHEABLE_QUERY = new Map([
  // Slugs, as the shop issues them.
  ['category', /^[a-z0-9][a-z0-9-]{0,60}$/i],
  ['brand', /^[a-z0-9][a-z0-9-]{0,60}$/i],
  // A closed set the listing writes itself.
  ['sort', /^(default|price-asc|price-desc|newest|name)$/],
  ['status', /^[a-z0-9-]{1,40}$/i],
  /**
   * Bounded deliberately. `page` is a number, and a number is unbounded unless
   * something says otherwise — without a ceiling, `?page=91234` is a fresh
   * cache entry for every integer anyone cares to type.
   */
  ['page', /^([1-9]|1[0-9]|20)$/],
]);

/** Cookies whose presence means this is not an anonymous read. */
const IDENTITY_COOKIES = /(?:^|;\s*)(tsk_session|tsk_agent_attribution)=/;

/** Held this long if the response does not say. Short, because it is a guess. */
const DEFAULT_TTL = 60;

/** The `s-maxage` the page already declares, which is where the number belongs. */
function ttlOf(headers) {
  const directive = String(headers.get('cache-control') || '');
  const found = directive.match(/s-maxage=(\d+)/);
  const seconds = found ? Number(found[1]) : 0;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TTL;
}

/**
 * The address this page is filed under, or null if it may not be filed at all.
 */
export function cacheKeyUrl(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!ALLOWED.has(path) && !path.startsWith(ALLOWED_PREFIX)) return null;

  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING.test(name)) url.searchParams.delete(name);
  }

  /**
   * What is left has to be a filter this cache knows, holding a value it
   * recognises. Anything else — an unknown name, or a known one carrying
   * something unexpected — is let through uncached rather than guessed at.
   */
  const kept = [];
  for (const name of [...url.searchParams.keys()]) {
    const shape = CACHEABLE_QUERY.get(name);
    if (!shape) return null;
    const value = url.searchParams.get(name) || '';
    // An empty filter is how the listing spells "no filter" when it rewrites
    // its own address, and it renders the same page as no parameter at all.
    if (!value) continue;
    if (!shape.test(value)) return null;
    kept.push([name, value]);
  }

  /**
   * Sorted, so `?brand=makita&category=tools` and `?category=tools&brand=makita`
   * are one entry rather than two copies of one page — which is the difference
   * between a cache and a museum.
   */
  kept.sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0));
  url.search = '';
  for (const [name, value] of kept) url.searchParams.append(name, value);

  url.pathname = path;
  url.hash = '';
  return url.toString();
}

/**
 * Why this request may not be answered from a shared cache, or null if it may.
 *
 * Named rather than boolean for the same reason `pageCacheSave` reports a
 * reason: "not cacheable" covers four different refusals, and a deployment
 * that says only that costs a round of guessing to narrow. The path is
 * included because the one thing that cannot be checked from here is what URL
 * the worker was actually handed.
 */
export function cacheRefusal(request) {
  if (request.method !== 'GET') return `method-${request.method}`;
  if (IDENTITY_COOKIES.test(String(request.headers.get('cookie') || ''))) return 'identity-cookie';

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!ALLOWED.has(path) && !path.startsWith(ALLOWED_PREFIX)) return `path-${path}`;
  if (!cacheKeyUrl(request)) return 'query';
  return null;
}

/** Whether this request may be answered from, or written to, a shared cache. */
export function mayCache(request) {
  return cacheRefusal(request) === null;
}

/** A copy of `response` with one header added, since headers are immutable. */
function tagged(response, state) {
  const headers = new Headers(response.headers);
  headers.set('x-tsk-page-cache', state);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * The stored copy, if there is one.
 *
 * Everything here degrades to nothing: `caches` does not exist under Node, so
 * the test suite and any local run pass straight through — the same bargain
 * api/lib/edge-cache.js makes.
 */
export async function pageCacheMatch(request) {
  if (typeof caches === 'undefined' || !caches.default) return null;
  if (!mayCache(request)) return null;
  const key = cacheKeyUrl(request);
  if (!key) return null;
  try {
    const hit = await caches.default.match(new Request(key, { method: 'GET' }));
    return hit ? tagged(hit, 'HIT') : null;
  } catch {
    // A cache that will not answer is a cache that is not there.
    return null;
  }
}

/**
 * Files a rendered page. Returns `'STORED'`, or the reason it was not.
 *
 * Takes the pieces rather than a Response because the caller is Nitro's
 * `beforeResponse` hook, which holds a body and a set of response headers and
 * has not built a Response yet — and building one only to take it apart again
 * would mean the body is read twice on the path that is already the slow one.
 *
 * ## Why a reason and not a boolean
 *
 * The first two deployments of this cache stored nothing, and both times the
 * only thing visible from outside was that nothing was stored. A boolean says
 * "no" without saying which of seven conditions said it, so finding out meant
 * reading the bundle, guessing, deploying, and looking again — twice.
 *
 * The reason goes out on the response as `x-tsk-page-cache: SKIP:<reason>`, so
 * one `curl -I` names the guard. It describes this cache's own policy and
 * nothing about the visitor, which is what makes it safe to publish.
 *
 * The write is handed to `waitUntil` rather than awaited: the shopper who paid
 * for this render must not also pay for storing it.
 */
export function pageCacheSave(request, { status, headers, body }, waitUntil) {
  // The request is judged before the runtime is, so a local `nuxt preview` —
  // where `caches` does not exist — still reports which guard a page would hit
  // in production. That is the difference between finding this out in a
  // terminal and finding it out one deploy at a time.
  const refusal = cacheRefusal(request);
  if (refusal) return refusal;
  if (typeof caches === 'undefined' || !caches.default) return 'no-cache-api';
  if (status !== 200) return `status-${status}`;
  if (typeof body !== 'string') return `body-${typeof body}`;
  if (!body) return 'body-empty';

  const outgoing = new Headers(headers || {});
  if (outgoing.has('set-cookie')) return 'set-cookie';

  /**
   * The body decides whether this is a page, not the header.
   *
   * `beforeResponse` fires before h3 has set `content-type` — it sets that when
   * it sends the body, from the body's own type — so at this point the header
   * is usually absent on a rendered page. Requiring it here meant every single
   * render was refused and the cache stayed permanently empty, which is exactly
   * what the first deployment of this did: the code was in the worker, the hook
   * fired, and nothing was ever stored.
   *
   * A declared content-type is still honoured when there is one, so a handler
   * that answers JSON is refused on its say-so rather than on a guess.
   */
  const declared = String(outgoing.get('content-type') || '');
  if (declared && !/^text\/html/i.test(declared)) return 'content-type';
  if (!declared && !/^\s*<(?:!doctype html|html)\b/i.test(body.slice(0, 200))) return 'not-a-document';
  if (!declared) outgoing.set('content-type', 'text/html;charset=utf-8');

  const key = cacheKeyUrl(request);
  if (!key) return 'no-key';

  // What the shared cache is told to hold it for. The page's own header says
  // `max-age=0` so a browser always revalidates, which is right for a browser
  // and would mean nothing was ever kept here.
  const ttl = ttlOf(outgoing);
  outgoing.set('cache-control', `public, max-age=${ttl}`);
  outgoing.set('x-tsk-page-cache', 'STORED');

  const write = caches.default
    .put(new Request(key, { method: 'GET' }), new Response(body, { status: 200, headers: outgoing }))
    .catch(() => {});
  if (typeof waitUntil === 'function') waitUntil(write); else void write;

  return 'STORED';
}
