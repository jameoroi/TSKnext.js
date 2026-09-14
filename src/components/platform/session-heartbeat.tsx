'use client';

import { useEffect } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

const HEARTBEAT_MS = 5 * 60 * 1000;
const VISIBILITY_REFRESH_AFTER_MS = 60 * 1000;

/**
 * Keeps the preserved secure session sliding window alive without ever using
 * browser storage as authentication state. A temporary store outage is
 * surfaced as an event for observability/UI, but never logs the user out or
 * redirects them.
 */
export function SessionHeartbeat() {
  useEffect(() => {
    let disposed = false;
    let running = false;
    let lastAttempt = 0;

    async function ping() {
      if (disposed || running || document.visibilityState === 'hidden' || !navigator.onLine) return;
      running = true;
      lastAttempt = Date.now();
      try {
        await legacyRequest('session');
        window.dispatchEvent(
          new CustomEvent('tsk:session-heartbeat', { detail: { ok: true, at: lastAttempt } }),
        );
      } catch (error) {
        const detail =
          error instanceof LegacyApiError
            ? {
                ok: false,
                at: lastAttempt,
                status: error.status,
                code: error.code,
                retryAfterMs: error.retryAfterMs,
              }
            : { ok: false, at: lastAttempt, status: 0, code: 'network_error', retryAfterMs: 0 };
        window.dispatchEvent(new CustomEvent('tsk:session-temporary-error', { detail }));
      } finally {
        running = false;
      }
    }

    const onOnline = () => {
      void ping();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAttempt >= VISIBILITY_REFRESH_AFTER_MS)
        void ping();
    };

    // Let the first document paint and hydrate before the background session
    // check competes with hero/catalog requests on a cold visit.
    const startupTimer = window.setTimeout(() => void ping(), 1200);
    const timer = window.setInterval(() => {
      void ping();
    }, HEARTBEAT_MS);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
