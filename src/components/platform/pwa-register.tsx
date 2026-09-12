'use client';

import { useEffect } from 'react';

const UPDATE_EVERY_MS = 60 * 60 * 1000;

/**
 * Registers the app-shell worker only in production and keeps it fresh without
 * caching the worker script itself. A new deployment can therefore replace
 * stale static chunks promptly instead of pinning a shopper to an old build.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    let disposed = false;
    let timer = 0;
    let removeRuntimeListeners = () => undefined;

    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (disposed) return;
        const update = () => {
          if (document.visibilityState === 'visible' && navigator.onLine) void registration.update().catch(() => undefined);
        };
        timer = window.setInterval(update, UPDATE_EVERY_MS);
        window.addEventListener('online', update);
        document.addEventListener('visibilitychange', update);
        removeRuntimeListeners = () => {
          window.removeEventListener('online', update);
          document.removeEventListener('visibilitychange', update);
        };
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      removeRuntimeListeners();
    };
  }, []);

  return null;
}
