/**
 * Which requests the edge cache in worker-entry.js may answer, and under which key.
 *
 * Kept free of Worker bindings so it can be unit tested (tests/unit/edge-cache-key.test.ts).
 *
 * The cache key used to be the full URL. Any unknown query string (a tracking
 * parameter, or a random one) then missed the cache and forced a full render,
 * and on Workers Free a render can exceed the CPU limit ("error code: 1102").
 * Pages only read the parameters listed below, so everything else is left out
 * of the key: the HTML a page renders does not depend on it.
 */

// Public, cookie-independent pages. Anything with a session, a checkout, an
// account or the back office never reaches the cache.
export const PAGE_PATTERNS = [
  /^\/$/,
  /^\/products\/?$/,
  /^\/products\/[^/]+\/?$/,
  /^\/(brands|kits|news|videos|about|contact|privacy|terms|returns|partners|partner-register)\/?$/,
  /^\/(sitemap\.xml|robots\.txt)$/,
];

// Query parameters each cached page actually reads on the server
// (src/app/products/page.tsx and src/app/brands/page.tsx). Pages not listed read none.
const PAGE_QUERY = {
  '/products': [
    'q',
    'category',
    'brand',
    'status',
    'sort',
    'min_price',
    'max_price',
    'set',
    'page',
    'per_page',
  ],
  '/brands': ['q'],
};

// Read-only API actions that every page requests and that do not vary by visitor.
// products.list / products.get are left to the API so its scraping quotas still apply.
export const API_ACTIONS = new Set([
  'site.settings',
  'site.logo',
  'categories.list',
  'brands.list',
  'content.list',
  'content.image',
  'category-image',
]);

export const PRIVATE_COOKIE =
  /(?:^|;\s*)(tsk_session|tsk_agent_attribution|tsk_telegram_chat_token|(?:__Secure-|__Host-)?(?:authjs|next-auth)\.[^=]+)=/i;
export const PRIVATE_QUERY = /^(ref|agent|agent_ref|preview|token|upload_token)$/i;

// Ad and analytics click identifiers: they never change what the server returns.
const TRACKING_QUERY =
  /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|ttclid|twclid|li_fat_id|igshid|mc_cid|mc_eid|_ga|_gl|yclid|srsltid)$/i;

/** @param {{ method: string, headers: Headers }} request @param {URL} url */
export function cacheable(request, url) {
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

/**
 * The URL the edge cache stores a response under: same origin and path, only
 * the query parameters that change the response, in a stable order.
 * @param {URL} url
 */
export function cacheKeyUrl(url) {
  const key = new URL(url.origin + url.pathname);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const entries = [...url.searchParams.entries()].filter(([name]) => {
    if (TRACKING_QUERY.test(name)) return false;
    // API actions keep their own parameters (action, id, v, compact, ...).
    if (url.pathname === '/api') return true;
    return (PAGE_QUERY[path] || []).includes(name);
  });
  entries.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  for (const [name, value] of entries) key.searchParams.append(name, value);
  return key;
}

/** R2 object key for the last-good copy. `_` keeps it outside isMediaKey(), so /media never serves it. */
export async function lastGoodObjectKey(keyUrl) {
  const bytes = new TextEncoder().encode(String(keyUrl));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `_edge/v1/${hex}`;
}

/**
 * Scope a cache key to the deployment that rendered it. Every deploy replaces
 * the hashed /_next/static chunks, so HTML cached by the previous build points
 * at scripts that now answer 404 and the page never hydrates (no cart, zoom or
 * filters). The version comes from the CF_VERSION_METADATA binding.
 * @param {URL} keyUrl @param {string | undefined} version
 */
export function versionedKey(keyUrl, version) {
  const key = new URL(keyUrl);
  if (version) key.searchParams.set('__build', String(version));
  return key;
}

/**
 * The build assets a cached HTML page loads (/_next/static/...), without query
 * strings, de-duplicated. A copy rendered by an earlier deploy is only safe to
 * serve when every one of these still exists: chunk names are content hashes,
 * so unchanged code keeps its name across deploys and changed code does not.
 * @param {string} html
 */
export function staticAssetPaths(html) {
  const found = new Set();
  for (const match of String(html).matchAll(
    /\/_next\/static\/[A-Za-z0-9_\-./%~]+?\.(?:js|css|woff2?)(?=[\\"'\s)?#]|$)/g,
  )) {
    found.add(match[0]);
    if (found.size >= 80) break;
  }
  return [...found];
}
