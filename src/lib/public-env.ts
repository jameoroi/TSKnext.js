/**
 * Public configuration read at request time instead of build time.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` while building. On Cloudflare the
 * values live as Worker secrets, which exist only at runtime, so keys added in
 * the dashboard never reached the browser (PostHog, Sentry, Turnstile and the
 * contact links stayed off). The server reads them dynamically and the root
 * layout hands the same snapshot to the browser as `window.__TSK_PUBLIC__`.
 * Only public, non-secret values belong in this list.
 */
export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_FB_PAGE_ID',
  'NEXT_PUBLIC_FB_PAGE_USERNAME',
  'NEXT_PUBLIC_FB_THEME_COLOR',
  'NEXT_PUBLIC_LINE_OA_URL',
  'NEXT_PUBLIC_LINE_OA_ID',
  'NEXT_PUBLIC_CONTACT_PHONE',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];
export type PublicEnv = Partial<Record<PublicEnvKey, string>>;

declare global {
  interface Window {
    __TSK_PUBLIC__?: PublicEnv;
  }
}

function serverValue(name: PublicEnvKey) {
  // Indexed access keeps the bundler from inlining the build-time value.
  const env = process.env as Record<string, string | undefined>;
  return String(env[name] || '').trim();
}

export function publicEnv(name: PublicEnvKey): string {
  if (typeof window !== 'undefined') return String(window.__TSK_PUBLIC__?.[name] || '').trim();
  return serverValue(name);
}

export function publicEnvSnapshot(): PublicEnv {
  const out: PublicEnv = {};
  for (const name of PUBLIC_ENV_KEYS) {
    const value = serverValue(name);
    if (value) out[name] = value;
  }
  return out;
}
