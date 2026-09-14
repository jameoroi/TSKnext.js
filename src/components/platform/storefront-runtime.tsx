'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { normalizeAgentRef, rememberAgentRef } from '@/features/agent/referral';
import { migrateLegacyCartIfNeeded } from '@/features/cart/store';
import { onConsentChange, readConsent } from '@/features/privacy/consent';
import { trackInternalAnalytics } from '@/lib/internal-analytics.client';
import { legacyRequest } from '@/lib/legacy-api.client';

const LEGACY_ROUTE_MAP: Record<string, string> = {
  about: '/about',
  account: '/account',
  admin: '/admin',
  'admin-settings': '/admin/settings',
  'agent-center': '/agent',
  'agent-store': '/store',
  cart: '/cart',
  checkout: '/checkout',
  compare: '/compare',
  contact: '/contact',
  inventory: '/admin/inventory',
  login: '/login',
  news: '/news',
  'network-ops': '/operations/network',
  'owner-console': '/owner',
  'partner-register': '/partner-register',
  partners: '/partners',
  privacy: '/privacy',
  product: '/product',
  products: '/products',
  reports: '/admin/reports',
  returns: '/returns',
  'supplier-portal': '/supplier',
  terms: '/terms',
  'track-order': '/track-order',
  'verify-payment': '/verify-payment',
  videos: '/videos',
  wishlist: '/wishlist',
};

function rewriteLegacyLinks(root: ParentNode = document) {
  const links = [
    ...(root instanceof HTMLAnchorElement && root.hasAttribute('href') ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')),
  ];
  links.forEach((link) => {
    const raw = link.getAttribute('href') || '';
    if (!/\.html(?:[?#]|$)/i.test(raw)) return;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const file =
        url.pathname
          .split('/')
          .pop()
          ?.replace(/\.html$/i, '') || '';
      const target = LEGACY_ROUTE_MAP[file] || (file ? `/${file}` : '/');
      // The old agent-store page became /store while preserving ref/code.
      const next = target + url.search + url.hash;
      if (link.getAttribute('href') !== next) link.setAttribute('href', next);
    } catch {
      // Ignore malformed CMS/third-party links rather than breaking navigation.
    }
  });
}

function animateCartAdd(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-cart-add]');
  if (!target) return;
  target.classList.remove('cart-added');
  void target.offsetWidth;
  target.classList.add('cart-added');
  window.setTimeout(() => target.classList.remove('cart-added'), 520);

  const badge = document.querySelector<HTMLElement>('[data-cart-count]');
  if (!badge) return;
  const from = target.getBoundingClientRect();
  const to = badge.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'cart-fly-dot';
  dot.style.left = `${from.left + from.width / 2 - 6}px`;
  dot.style.top = `${from.top + from.height / 2 - 6}px`;
  dot.style.setProperty('--fly-x', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
  dot.style.setProperty('--fly-y', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
  document.body.appendChild(dot);
  window.setTimeout(() => dot.remove(), 720);
  badge.classList.remove('cart-pop');
  void badge.offsetWidth;
  badge.classList.add('cart-pop');
  window.setTimeout(() => badge.classList.remove('cart-pop'), 520);
}

/**
 * Browser-only compatibility layer for behaviors that were Nuxt plugins:
 * referral attribution, first-party page views, legacy CMS links and cart
 * feedback. Keeping them here makes route transitions work without DOM races.
 */
export function StorefrontRuntime() {
  const pathname = usePathname();
  const search = useSearchParams();
  const offered = useRef(new Set<string>());
  const lastPageView = useRef('');

  useEffect(() => {
    migrateLegacyCartIfNeeded();
    rewriteLegacyLinks();
    const observer = new MutationObserver((entries) => {
      for (const entry of entries) {
        for (const node of entry.addedNodes) {
          if (node instanceof Element) rewriteLegacyLinks(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', animateCartAdd, { passive: true });
    return () => {
      observer.disconnect();
      document.removeEventListener('click', animateCartAdd);
    };
  }, []);

  useEffect(() => {
    rewriteLegacyLinks();
    const key = `${pathname}?${search.toString()}`;
    if (readConsent()?.analytics && lastPageView.current !== key) {
      lastPageView.current = key;
      trackInternalAnalytics('page_view');
    }
  }, [pathname, search]);

  useEffect(
    () =>
      onConsentChange((next) => {
        if (!next?.analytics) return;
        const key = `${window.location.pathname}?${window.location.search.replace(/^\?/, '')}`;
        if (lastPageView.current === key) return;
        lastPageView.current = key;
        trackInternalAnalytics('page_view');
      }),
    [],
  );

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const observers: IntersectionObserver[] = [];
    const reveal = (selector: string, done: string, options: IntersectionObserverInit) => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
        (node) => !node.classList.contains(done),
      );
      if (!nodes.length) return;
      if (reduced || !('IntersectionObserver' in window)) {
        nodes.forEach((node) => node.classList.add(done));
        return;
      }
      const watcher = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add(done);
          watcher.unobserve(entry.target);
        }
      }, options);
      nodes.forEach((node) => watcher.observe(node));
      observers.push(watcher);
    };
    reveal('.reveal:not(.in)', 'in', { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveal('.hero-features:not(.mv-in)', 'mv-in', { threshold: 0.3 });
    reveal('.sec-head:not(.mv-in)', 'mv-in', { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });

    const topButton = document.querySelector<HTMLElement>('.back-to-top');
    const updateProgress = () => {
      if (!topButton) return;
      const doc = document.documentElement;
      const height = Math.max(1, doc.scrollHeight - doc.clientHeight);
      const progress = Math.min(1, Math.max(0, (doc.scrollTop || document.body.scrollTop || 0) / height));
      topButton.style.setProperty('--btt-progress', `${(progress * 360).toFixed(1)}deg`);
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();

    const categoryGrid = document.getElementById('catGrid');
    const onCategoryMove = (event: MouseEvent) => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cat-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty(
        '--mx',
        `${(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100).toFixed(1)}%`,
      );
      card.style.setProperty(
        '--my',
        `${(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100).toFixed(1)}%`,
      );
    };
    if (!reduced) categoryGrid?.addEventListener('mousemove', onCategoryMove, { passive: true });

    const memberCard = document.querySelector<HTMLElement>('.home-member-card');
    if (memberCard && !reduced && !memberCard.querySelector('.mv-particle-field')) {
      const field = document.createElement('div');
      field.className = 'mv-particle-field';
      field.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 14; index += 1) {
        const dot = document.createElement('span');
        dot.style.left = `${(Math.random() * 96 + 2).toFixed(1)}%`;
        const size = `${(2 + Math.random() * 3).toFixed(1)}px`;
        dot.style.width = size;
        dot.style.height = size;
        dot.style.animationDuration = `${(7 + Math.random() * 6).toFixed(1)}s`;
        dot.style.animationDelay = `${(Math.random() * 8).toFixed(1)}s`;
        field.appendChild(dot);
      }
      memberCard.insertBefore(field, memberCard.firstChild);
    }

    const featured = document.getElementById('featuredGrid');
    if (featured && !reduced) {
      featured.querySelectorAll<HTMLElement>('.prod-card:not([data-staggered])').forEach((card, index) => {
        card.dataset.staggered = '1';
        const delay = Math.min(index * 70, 350);
        card.style.setProperty('--v25-delay', `${delay}ms`);
        card.animate?.(
          [
            { opacity: 0.15, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 520, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
        );
      });
    }

    const hero = document.querySelector<HTMLElement>('.hero-slide');
    const onHeroMove = (event: PointerEvent) => {
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      hero.style.setProperty(
        '--v25-x',
        `${(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100).toFixed(1)}%`,
      );
      hero.style.setProperty(
        '--v25-y',
        `${(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100).toFixed(1)}%`,
      );
    };
    const resetHero = () => {
      hero?.style.setProperty('--v25-x', '50%');
      hero?.style.setProperty('--v25-y', '50%');
    };
    if (hero && !reduced && window.innerWidth >= 900) {
      hero.addEventListener('pointermove', onHeroMove);
      hero.addEventListener('pointerleave', resetHero);
    }

    return () => {
      observers.forEach((watcher) => watcher.disconnect());
      window.removeEventListener('scroll', updateProgress);
      categoryGrid?.removeEventListener('mousemove', onCategoryMove);
      hero?.removeEventListener('pointermove', onHeroMove);
      hero?.removeEventListener('pointerleave', resetHero);
    };
  }, [pathname]);

  useEffect(() => {
    const code = normalizeAgentRef(search.get('ref') || search.get('code'));
    if (!code || offered.current.has(code)) return;
    offered.current.add(code);
    void legacyRequest<{ attribution?: { agent_code?: string } }>('partner.resolve', { code })
      .then((answer) => rememberAgentRef(answer?.attribution?.agent_code || code))
      .catch(() => offered.current.delete(code));
  }, [pathname, search]);

  return null;
}
