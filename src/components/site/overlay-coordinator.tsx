'use client';

import { useEffect } from 'react';
import { useAuthModalStore } from '@/features/auth/modal-store';
import { useQuickViewStore } from '@/features/catalog/quick-view';
import { setOverlay } from '@/lib/overlay-bus';

/** Reports the quick view and sign-in dialogs to the overlay bus (their stores live elsewhere). */
export function OverlayCoordinator() {
  useEffect(() => {
    const syncQuickView = () => setOverlay('quick-view', Boolean(useQuickViewStore.getState().product));
    const syncAuth = () => setOverlay('auth', Boolean(useAuthModalStore.getState().open));
    syncQuickView();
    syncAuth();
    const offQuickView = useQuickViewStore.subscribe(syncQuickView);
    const offAuth = useAuthModalStore.subscribe(syncAuth);
    return () => {
      offQuickView();
      offAuth();
      setOverlay('quick-view', false);
      setOverlay('auth', false);
    };
  }, []);
  return null;
}
