/**
 * The response headers every page must carry.
 *
 * Applied in two places, both Next.js-native:
 *   1. `next.config.ts` `headers()` — sets these on every `/:path*` response
 *      (plus no-cache for /sw.js and the manifest content-type).
 *   2. This module is the single definition both the config and any future
 *      middleware/proxy use — never duplicate the strings elsewhere.
 *
 * Production collects addresses and payment slips, so these must stay on:
 * framing protection (clickjacking on checkout), HSTS, no-sniff, a locked-down
 * referrer/permission set, and a CSP. Every source listed is one the
 * storefront actually loads: connect.facebook.net for the optional chat
 * widget, googletagmanager for analytics once a measurement id is set,
 * YouTube for the embeds on /videos, and `img-src https:` for the Supabase
 * media bucket and the supplier image host. `unsafe-inline` on scripts is
 * currently required by Next.js inlined flight data/runtime scripts; removing
 * it needs nonces threaded through the render, not a one-line edit. Adding a
 * third-party embed means adding it here too.
 *
 * Private routes are kept out of search indexes by each page's own metadata
 * (`robots: noindex`) and by robots.txt, not from here.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // static.cloudflareinsights.com is the Browser Insights beacon. Cloudflare
  // injects that script at the edge, after this header is written, so the
  // policy has been blocking a script the shop itself asked for: the console
  // showed the refusal on every page load and the RUM numbers in the
  // dashboard were of nobody. It is in the "keep" list in the plan and it
  // was not working.
  /*
   * The marketing tags, each named rather than the policy widened.
   *
   * TikTok is the new host; Google Tag Manager and Facebook were already
   * here. Analytics is the one place a CSP earns its keep — a tag is a
   * third party executing on a page that takes addresses and payment slips —
   * so the answer to "add a pixel" is another host on this line, never a
   * wildcard. A shop that has configured none of them loads none of them, and
   * the entry stays harmless.
   */
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://analytics.tiktok.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  'frame-src https://www.facebook.com https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com',
  'upgrade-insecure-requests',
].join('; ');

/**
 * What the policy should be, reported on but not enforced.
 *
 * The enforced policy above has two openings that are worth closing and cannot
 * be closed blind:
 *
 *   connect-src 'self' https:   any script on the page may call any https host
 *   script-src ... 'unsafe-inline'   inline script runs
 *
 * `https:` on connect-src means an injected script can post anything it can
 * read — a cart, an address, a session-bound response — to a server of the
 * attacker's choosing, and the policy will not object. `unsafe-inline` is
 * currently required by Next.js inlined flight/runtime payloads, so removing
 * it needs nonces threaded through the render, not a one-line edit.
 *
 * Tightening either one blind risks breaking a real integration on a live
 * shop, so this ships alongside as Report-Only first. It enforces nothing: the
 * browser evaluates it, reports what would have been blocked to
 * `?action=csp.report`, and the shop keeps working. When the reports are quiet
 * for long enough, this becomes the enforced policy and the one above is
 * deleted.
 */
export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // static.cloudflareinsights.com is the Browser Insights beacon. Cloudflare
  // injects that script at the edge, after this header is written, so the
  // policy has been blocking a script the shop itself asked for: the console
  // showed the refusal on every page load and the RUM numbers in the
  // dashboard were of nobody. It is in the "keep" list in the plan and it
  // was not working.
  /*
   * The marketing tags, each named rather than the policy widened.
   *
   * TikTok is the new host; Google Tag Manager and Facebook were already
   * here. Analytics is the one place a CSP earns its keep — a tag is a
   * third party executing on a page that takes addresses and payment slips —
   * so the answer to "add a pixel" is another host on this line, never a
   * wildcard. A shop that has configured none of them loads none of them, and
   * the entry stays harmless.
   */
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://analytics.tiktok.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  /*
   * Named hosts rather than all of https:, and the media bucket is one of them.
   *
   * This line used to list only Supabase, which does not serve a single product
   * image: they live in the R2 bucket, and have since the media store moved.
   * So every image on every catalogue page violated this policy, and because
   * the policy carries a report-uri, every one of them POSTed a report back to
   * this shop's own API. A category page of thirty products meant thirty
   * reports per view, the rate limiter answered 429, and the page visibly
   * stuttered under its own reporting. A report-only policy is a linting tool;
   * it had turned into a load generator pointed at the site it was linting.
   *
   * The r2.dev host is where the shop's own uploads are served from and belongs
   * here permanently. MEDIA_PUBLIC_BASE_URL is the same bucket behind whatever
   * domain a deployment fronts it with.
   *
   * The three analytics hosts are here because a tracking pixel is literally an
   * image: Meta, GA4 and TikTok each report a page view by loading a 1x1 GIF.
   * script-src already allows their tags to run, so leaving them off this line
   * blocked nothing and only produced one violation report per page view.
   */
  "img-src 'self' data: blob: https://*.r2.dev https://*.r2.cloudflarestorage.com https://*.supabase.co https://*.supabase.in https://inet-s3-object-gw.inet.co.th https://nexgencommerce.one.th https://www.facebook.com https://www.google-analytics.com https://analytics.tiktok.com https://ad.doubleclick.net https://ade.googlesyndication.com https://adservice.google.com",
  // The media bucket. The console uploads a picture by PUTting it straight to
  // R2 from the browser, so the address it posts to has to be listed here or
  // the day this policy stops being report-only is the day uploads stop
  // working — with a different symptom from the CORS fault that hid it.
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://*.r2.cloudflarestorage.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com https://cloudflareinsights.com https://challenges.cloudflare.com https://pagead2.googlesyndication.com https://www.google.com https://www.googleadservices.com https://ad.doubleclick.net",
  'frame-src https://www.facebook.com https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com',
  // No `upgrade-insecure-requests` here on purpose: a browser ignores it in a
  // report-only policy and says so in the console on every page load. The
  // enforced policy above carries it, which is where it does something.
  'report-uri /api?action=csp.report',
].join('; ');

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  // Enforces nothing. See the note above CONTENT_SECURITY_POLICY_REPORT_ONLY.
  'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY_REPORT_ONLY,
};
