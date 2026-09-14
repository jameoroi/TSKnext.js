'use client';

import posthog from 'posthog-js';
import { readConsent } from '@/features/privacy/consent';
import { trackInternalAnalytics } from '@/lib/internal-analytics.client';

export type MarketingEvent =
  | 'view_item'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'search'
  | 'view_item_list';
export type MarketingItem = {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  brand?: string;
  category?: string;
};
export type MarketingPayload = {
  value?: number;
  currency?: string;
  order_id?: string;
  search_term?: string;
  items?: MarketingItem[];
};

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    ttq?: any;
  }
}

export function trackMarketing(event: MarketingEvent, payload: MarketingPayload = {}) {
  if (typeof window === 'undefined') return;
  const consent = readConsent();
  if (!consent) return;
  const currency = payload.currency || 'THB';
  const items = payload.items || [];
  const value = Number(
    payload.value ??
      items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0),
  );

  if (consent.analytics) {
    try {
      if (posthog.__loaded) posthog.capture(event, { ...payload, value, currency });
    } catch {}
    const internal =
      event === 'view_item'
        ? 'product_view'
        : event === 'add_to_cart'
          ? 'add_to_cart'
          : event === 'begin_checkout'
            ? 'begin_checkout'
            : null;
    if (internal) trackInternalAnalytics(internal, String(items[0]?.id || ''));
  }
  if (!consent.marketing) return;

  try {
    window.gtag?.('event', event, {
      currency,
      value,
      transaction_id: payload.order_id,
      search_term: payload.search_term,
      items: items.map((item) => ({
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        item_brand: item.brand,
        item_category: item.category,
      })),
    });
  } catch {}
  try {
    const map: Partial<Record<MarketingEvent, string>> = {
      view_item: 'ViewContent',
      add_to_cart: 'AddToCart',
      begin_checkout: 'InitiateCheckout',
      purchase: 'Purchase',
      search: 'Search',
    };
    const name = map[event];
    if (name)
      window.fbq?.('track', name, {
        content_type: 'product',
        content_ids: items.map((item) => item.id),
        contents: items.map((item) => ({
          id: item.id,
          quantity: item.quantity || 1,
          item_price: item.price,
        })),
        value,
        currency,
        search_string: payload.search_term,
      });
  } catch {}
  try {
    const map: Partial<Record<MarketingEvent, string>> = {
      view_item: 'ViewContent',
      add_to_cart: 'AddToCart',
      begin_checkout: 'InitiateCheckout',
      purchase: 'CompletePayment',
      search: 'Search',
    };
    const name = map[event];
    if (name)
      window.ttq?.track?.(name, {
        contents: items.map((item) => ({
          content_id: item.id,
          content_type: 'product',
          content_name: item.name,
          price: item.price,
          quantity: item.quantity || 1,
        })),
        value,
        currency,
        query: payload.search_term,
      });
  } catch {}
}
