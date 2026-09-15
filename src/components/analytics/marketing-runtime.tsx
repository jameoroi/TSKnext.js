'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type ConsentPreferences, onConsentChange, readConsent } from '@/features/privacy/consent';
import { capturePosthog, loadPosthog } from '@/lib/posthog.client';

const floodlightId = (value: unknown) => {
  const raw = String(value || '')
    .trim()
    .replace(/^DC-/i, '');
  return raw ? `DC-${raw}` : '';
};

function appendScript(src: string) {
  if (Array.from(document.scripts).some((tag) => tag.src === src)) return;
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = src;
  document.head.appendChild(tag);
}

export function MarketingRuntime() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);
  const startedMarketing = useRef(false);
  const startedAnalytics = useRef(false);

  useEffect(() => {
    setConsent(readConsent());
    return onConsentChange(setConsent);
  }, []);

  useEffect(() => {
    if (!consent?.analytics || startedAnalytics.current) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    startedAnalytics.current = true;
    void loadPosthog(key, process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').then(() =>
      capturePosthog('$pageview', { $current_url: window.location.href }),
    );
  }, [consent?.analytics]);

  useEffect(() => {
    if (!consent?.marketing || startedMarketing.current) return;
    let cancelled = false;
    async function start() {
      const response = await fetch('/api?action=site.settings&compact=1', { credentials: 'include' }).catch(
        () => null,
      );
      const data = response ? await response.json().catch(() => ({})) : {};
      if (cancelled) return;
      const ids = data?.settings?.marketing || {};
      const ga4 = String(ids.ga4_id || '').trim();
      const gtm = String(ids.gtm_id || '').trim();
      const meta = String(ids.meta_pixel_id || '').trim();
      const tiktok = String(ids.tiktok_pixel_id || '').trim();
      const floodlight = floodlightId(ids.floodlight_advertiser_id);
      if (!ga4 && !gtm && !meta && !tiktok && !floodlight) return;
      startedMarketing.current = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag =
        window.gtag ||
        function gtag(...args: any[]) {
          window.dataLayer?.push(args);
        };
      window.gtag('js', new Date());
      if (ga4 || floodlight)
        appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4 || floodlight)}`);
      if (ga4) window.gtag('config', ga4, { send_page_view: false });
      if (floodlight) window.gtag('config', floodlight, { send_page_view: false });
      if (gtm) {
        window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        appendScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`);
      }
      if (meta) {
        if (!window.fbq) {
          const fbq: any = (...args: any[]) =>
            fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
          fbq.queue = [];
          fbq.loaded = true;
          fbq.version = '2.0';
          window.fbq = fbq;
        }
        appendScript('https://connect.facebook.net/en_US/fbevents.js');
        window.fbq?.('init', meta);
      }
      if (tiktok) {
        const ttq: any = (window.ttq = window.ttq || []);
        ttq.methods = [
          'page',
          'track',
          'identify',
          'instances',
          'debug',
          'on',
          'off',
          'once',
          'ready',
          'alias',
          'group',
          'enableCookie',
          'disableCookie',
        ];
        ttq.setAndDefer = (target: any, method: string) => {
          target[method] = (...args: any[]) => target.push([method, ...args]);
        };
        for (const method of ttq.methods) ttq.setAndDefer(ttq, method);
        ttq._i = ttq._i || {};
        ttq._i[tiktok] = [];
        ttq._t = ttq._t || {};
        ttq._t[tiktok] = Date.now();
        appendScript(
          `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(tiktok)}&lib=ttq`,
        );
      }
      sendPageView();
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [consent?.marketing]);

  useEffect(() => {
    if (consent?.analytics && startedAnalytics.current)
      capturePosthog('$pageview', { $current_url: window.location.href });
    if (consent?.marketing && startedMarketing.current) sendPageView();
  }, [pathname, search, consent?.analytics, consent?.marketing]);

  return null;
}

function sendPageView() {
  try {
    window.gtag?.('event', 'page_view', { page_path: location.pathname + location.search });
  } catch {}
  try {
    window.fbq?.('track', 'PageView');
  } catch {}
  try {
    window.ttq?.page?.();
  } catch {}
}
