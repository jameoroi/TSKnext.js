import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which storefront overlays are on screen, so they take turns.
 *
 * The entry popup, the cookie notice, the "recently viewed" card, the quick
 * view and the sign-in dialog each decided on their own when to appear. On a
 * first visit three of them opened at once, the recently viewed card was lifted
 * above the cookie notice into the middle of the page, and the auto-scrolling
 * rows kept moving behind a modal. Each overlay now reports itself here;
 * the others (and the moving rows) read it.
 */
export type OverlayName = 'entry-popup' | 'cookie-consent' | 'quick-view' | 'auth';

const active = new Set<OverlayName>();
const listeners = new Set<() => void>();

function emit() {
  if (typeof document !== 'undefined') {
    const value = [...active].sort().join(' ');
    if (value) document.documentElement.dataset.tskOverlay = value;
    else delete document.documentElement.dataset.tskOverlay;
  }
  for (const listener of listeners) listener();
}

export function setOverlay(name: OverlayName, open: boolean) {
  if (open === active.has(name)) return;
  if (open) active.add(name);
  else active.delete(name);
  emit();
}

export function isOverlayOpen(name: OverlayName) {
  return active.has(name);
}

/** Overlays that cover the page: rows and banners hold still behind them. */
const MOTION_BLOCKERS: OverlayName[] = ['entry-popup', 'quick-view', 'auth'];
export function motionPaused() {
  return MOTION_BLOCKERS.some((name) => active.has(name));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when the named overlay opens or closes. */
export function useOverlay(name: OverlayName) {
  return useSyncExternalStore(
    subscribe,
    () => active.has(name),
    () => false,
  );
}

/** Reports an overlay's visibility for as long as the component is mounted. */
export function useOverlayFlag(name: OverlayName, open: boolean) {
  useEffect(() => {
    setOverlay(name, open);
    return () => setOverlay(name, false);
  }, [name, open]);
}
