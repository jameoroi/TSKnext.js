'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { capturePosthog } from '@/lib/posthog.client';

/**
 * Real-user Core Web Vitals (LCP, CLS, INP, FCP, TTFB) to PostHog, so speed is
 * measured on shoppers' own phones and not only in lab runs. capturePosthog
 * sends nothing until analytics consent has loaded PostHog.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    capturePosthog('web_vitals', {
      metric: metric.name,
      value: metric.name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
      rating: metric.rating,
      navigation_type: metric.navigationType,
      path: typeof window !== 'undefined' ? window.location.pathname : '',
    });
  });
  return null;
}
