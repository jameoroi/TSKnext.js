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
 */
import openNext from '../.open-next/worker.js';

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from '../.open-next/worker.js';

const FRESH_SECONDS = 60;
const STALE_SECONDS = 600;
const STORED_AT = 'x-tsk-edge-stored-at';

// Public, cookie-independent pages. Anything with a session, a checkout, an
// account or the back office never reaches the cache.
const PAGE_PATTERNS = [
  /^\/$/,
  /^\/products\/?$/,
  /^\/products\/[^/]+\/?$/,
  /^\/(brands|kits|news|videos|about|contact|privacy|terms|returns|partners|partner-register)\/?$/,
];

// Read-only API actions that every page requests and that do not vary by visitor.
// products.list / products.get are left to the API so its scraping quotas still apply.
const API_ACTIONS = new Set([
  'site.settings',
  'site.logo',
  'categories.list',
  'brands.list',
  'content.list',
  'content.image',
  'category-image',
]);

const PRIVATE_COOKIE =
  /(?:^|;\s*)(tsk_session|tsk_agent_attribution|tsk_telegram_chat_token|(?:__Secure-|__Host-)?(?:authjs|next-auth)\.[^=]+)=/i;
const PRIVATE_QUERY = /^(ref|agent|agent_ref|preview|token|upload_token)$/i;

function cacheable(request, url) {
  if (request.method !== 'GET') return false;
  if (PRIVATE_COOKIE.test(request.headers.get('cookie') || '')) return false;
  if (request.headers.get('authorization')) return false;
  // Client-side navigations fetch React Server Component payloads for the same
  // URL; they differ from the HTML document, so they are not cached here.
  if (request.headers.get('rsc') || url.searchParams.has('_rsc')) return false;
  for (const key of url.searchParams.keys()) if (PRIVATE_QUERY.test(key)) return false;
  if (url.pathname === '/api') return API_ACTIONS.has(url.searchParams.get('action') || '');
  return PAGE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

function storable(response) {
  if (response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;
  const type = response.headers.get('content-type') || '';
  return type.includes('text/html') || type.includes('application/json') || type.startsWith('image/');
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
  return !BROKEN_HTML.test(text);
}

async function store(cache, key, response) {
  if (!(await healthy(response))) return;
  const headers = new Headers(response.headers);
  headers.set(STORED_AT, String(Date.now()));
  // The Cache API honours cache-control; the freshness decision is made above.
  headers.set('cache-control', `public, max-age=${FRESH_SECONDS + STALE_SECONDS}`);
  await cache.put(key, new Response(response.body, { status: response.status, headers }));
}

function forVisitor(cached, state) {
  const headers = new Headers(cached.headers);
  headers.delete(STORED_AT);
  headers.set('cache-control', 'private, no-cache');
  headers.set('x-tsk-edge-cache', state);
  return new Response(cached.body, { status: cached.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = globalThis.caches?.default;
    if (!cache || !cacheable(request, url)) return openNext.fetch(request, env, ctx);

    const key = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(key).catch(() => undefined);
    if (cached) {
      const age = (Date.now() - Number(cached.headers.get(STORED_AT) || 0)) / 1000;
      if (age < FRESH_SECONDS) return forVisitor(cached, 'HIT');
      if (age < FRESH_SECONDS + STALE_SECONDS) {
        ctx.waitUntil(
          openNext
            .fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env, ctx)
            .then((fresh) => (storable(fresh) ? store(cache, key, fresh) : undefined))
            .catch(() => undefined),
        );
        return forVisitor(cached, 'STALE');
      }
    }

    const response = await openNext.fetch(request, env, ctx);
    if (!storable(response)) return response;
    ctx.waitUntil(store(cache, key, response.clone()).catch(() => undefined));
    const headers = new Headers(response.headers);
    headers.set('x-tsk-edge-cache', 'MISS');
    return new Response(response.body, { status: response.status, headers });
  },
};
