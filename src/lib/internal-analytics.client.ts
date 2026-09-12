'use client';

import { readConsent } from '@/features/privacy/consent';

export type InternalAnalyticsEvent = 'page_view' | 'product_view' | 'add_to_cart' | 'begin_checkout';

const VISITOR_KEY = 'tsk-analytics-visitor';
const SESSION_KEY = 'tsk-analytics-session';

function identity(store: Storage, key: string) {
  let value = store.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    store.setItem(key, value);
  }
  return value;
}

/**
 * First-party analytics used by the legacy admin reports. This is best-effort,
 * never blocks shopping, and now respects the explicit analytics consent gate.
 */
export function trackInternalAnalytics(type: InternalAnalyticsEvent, productId = '') {
  if (typeof window === 'undefined') return;
  if (/^\/(admin|owner|account|operations)(\/|$)/.test(window.location.pathname)) return;
  if (readConsent()?.analytics !== true) return;

  try {
    const visitor = identity(window.localStorage, VISITOR_KEY);
    const session = identity(window.sessionStorage, SESSION_KEY);
    void fetch('/api', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        action: 'analytics.event',
        type,
        visitor,
        session,
        path: window.location.pathname,
        product_id: productId,
      }),
    }).catch(() => {});
  } catch {
    // Analytics must never break a storefront action.
  }
}
