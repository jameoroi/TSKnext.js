'use client';

import type { PostHog } from 'posthog-js';

// posthog-js is ~60 kB gzipped. Import it only after the shopper grants
// analytics consent, so the storefront bundle never carries it by default.
let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

export function loadPosthog(key: string, apiHost: string) {
  if (client) return Promise.resolve(client);
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!posthog.__loaded)
        posthog.init(key, {
          api_host: apiHost,
          capture_pageview: false,
          autocapture: true,
          persistence: 'localStorage+cookie',
        });
      client = posthog;
      return posthog;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

export function capturePosthog(event: string, properties?: Record<string, unknown>) {
  try {
    client?.capture(event, properties);
  } catch {}
}
