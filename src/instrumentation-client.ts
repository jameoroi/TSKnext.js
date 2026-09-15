import { publicEnv } from '@/lib/public-env';

// Sentry loads only when NEXT_PUBLIC_SENTRY_DSN is set as a Worker secret (read at
// runtime via window.__TSK_PUBLIC__); without it shoppers never download the SDK.
const dsn = publicEnv('NEXT_PUBLIC_SENTRY_DSN');
if (dsn) {
  void import('@sentry/nextjs').then((Sentry) =>
    Sentry.init({
      dsn,
      tracesSampleRate: Number(publicEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE') || 0.05),
    }),
  );
}
