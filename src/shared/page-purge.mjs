/**
 * Dropping a page the shop has already rendered, everywhere at once.
 *
 * ## The problem this exists for
 *
 * An admin deleted a promo banner, saved, and the banner stayed on the home
 * page. The save worked — `/api?action=site.settings` reported one banner while
 * the page still showed three — so from the console there was nothing left to
 * try, and changing a picture became something you did and then hoped about.
 *
 * `forgetSiteSettings()` already ran on save, but it clears `publicReadCache`,
 * which is a Map inside one worker isolate. What a shopper actually receives is
 * the rendered HTML, held in two places neither of which that Map reaches:
 *
 *   - `caches.default`, via shared/html-cache.mjs
 *   - Cloudflare's own edge cache, from `s-maxage=300,
 *     stale-while-revalidate=86400` in nuxt.config.ts
 *
 * The stale window is the long one and it is there on purpose: this shop is on
 * the free plan's 10ms of CPU, and every expiry without it was a blocking cold
 * render that answered `error code: 1102`. Shortening it to make edits appear
 * sooner would trade a slow shop for a broken one.
 *
 * ## Why the API and not `caches.default.delete`
 *
 * `caches.default` is per-colo. A delete from the worker handling the admin's
 * save drops the copy in that one city and leaves every other colo serving the
 * old page — which looks fixed to whoever tested it and is not fixed for
 * anybody else. Cloudflare's purge endpoint is the only thing that reaches all
 * of them.
 *
 * ## When it does nothing
 *
 * Without `CLOUDFLARE_API_TOKEN` (needs **Zone → Cache Purge**) and
 * `CLOUDFLARE_ZONE_ID` this returns `{ ok: false, reason: 'not_configured' }`
 * and the shop behaves exactly as it does today: an edit appears when the cache
 * expires. It is never a reason to fail a save — the setting is already stored
 * by the time this runs, and an admin who saw "บันทึกไม่สำเร็จ" because a cache
 * would not clear would be told the opposite of what happened.
 */

/** Pages whose content comes out of site settings or home content. */
export const SETTINGS_PAGES = ['/', '/news', '/videos', '/about', '/contact'];

/**
 * Ask Cloudflare to forget these pages.
 *
 * Returns a result rather than throwing, and never throws: every caller is a
 * save that has already succeeded.
 *
 * @param {string[]} paths absolute paths on the shop's own origin
 * @param {{ origin: string, token?: string, zoneId?: string, fetchImpl?: typeof fetch }} options
 */
export async function purgePages(paths, { origin, token, zoneId, fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { ok: false, reason: 'no_fetch' };
  if (!token || !zoneId) return { ok: false, reason: 'not_configured' };

  const base = String(origin || '').replace(/\/$/, '');
  if (!/^https:\/\//i.test(base)) return { ok: false, reason: 'bad_origin' };

  // Absolute addresses, de-duplicated, and capped: the endpoint takes at most
  // thirty per call and a caller that grew its list should not start failing.
  const files = [...new Set(paths.filter(Boolean).map((path) => `${base}${path}`))].slice(0, 30);
  if (!files.length) return { ok: false, reason: 'nothing_to_purge' };

  try {
    const response = await fetchImplCall(doFetch, zoneId, token, files);
    if (!response.ok) return { ok: false, reason: `http_${response.status}`, files: files.length };
    return { ok: true, files: files.length };
  } catch (error) {
    // The class, not the message: a failing request to this endpoint carries
    // the token in an Authorization header and some clients quote it back.
    return { ok: false, reason: failureClass(error), files: files.length };
  }
}

function fetchImplCall(doFetch, zoneId, token, files) {
  return doFetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ files }),
    // A save must not wait on this. Bounded so a hung request cannot hold the
    // response open behind it either.
    signal: AbortSignal.timeout(8_000),
  });
}

function failureClass(error) {
  const name = String(error?.name || '');
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(String(error?.message || ''))) return 'unreachable';
  return 'failed';
}
