'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { legacyRequest } from '@/lib/legacy-api.client';

const LEGACY_STORAGE_KEY = 'tsk_wishlist_local';
const NEXT_OLD_STORAGE_KEY = 'tsk_next_wishlist';

type WishlistState = {
  ids: string[];
  hydrated: boolean;
  setIds: (ids: string[]) => void;
  setHydrated: (value: boolean) => void;
};

const unique = (values: unknown[]) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 200);

export const useWishlistState = create<WishlistState>((set) => ({
  ids: [],
  hydrated: false,
  setIds: (ids) => set({ ids: unique(ids) }),
  setHydrated: (hydrated) => set({ hydrated }),
}));

function readGuestIds() {
  if (typeof window === 'undefined') return [] as string[];
  const collected: string[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) collected.push(...parsed.map(String));
  } catch {}
  // Earlier Next migration builds used Zustand's persist envelope. Fold that
  // temporary key back into the production legacy key so nobody loses hearts.
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NEXT_OLD_STORAGE_KEY) || 'null');
    const oldIds = Array.isArray(parsed?.state?.ids) ? parsed.state.ids : [];
    collected.push(...oldIds.map(String));
  } catch {}
  return unique(collected);
}

function writeGuestIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(unique(ids)));
  window.localStorage.removeItem(NEXT_OLD_STORAGE_KEY);
}

function clearGuestIds() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.localStorage.removeItem(NEXT_OLD_STORAGE_KEY);
}

let mergePromise: Promise<string[]> | null = null;

export function useWishlist() {
  const queryClient = useQueryClient();
  const ids = useWishlistState((state) => state.ids);
  const hydrated = useWishlistState((state) => state.hydrated);
  const setIds = useWishlistState((state) => state.setIds);
  const setHydrated = useWishlistState((state) => state.setHydrated);

  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => legacyRequest<any>('session'),
    staleTime: 60_000,
  });
  const signedIn = Boolean(session.data?.customer);
  const server = useQuery({
    queryKey: ['customer.wishlist'],
    queryFn: () => legacyRequest<{ ok: boolean; ids?: string[]; products?: any[] }>('customer.wishlist.list'),
    enabled: signedIn,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (hydrated || typeof window === 'undefined') return;
    setIds(readGuestIds());
    setHydrated(true);
  }, [hydrated, setHydrated, setIds]);

  useEffect(() => {
    if (!hydrated || session.isPending) return;
    if (!signedIn) {
      // If a session disappeared after logout, restore the guest source instead
      // of leaving stale account ids in memory.
      setIds(readGuestIds());
      return;
    }

    const serverIds = unique(server.data?.ids || []);
    const guestIds = readGuestIds();
    if (!guestIds.length) {
      if (server.data) setIds(serverIds);
      return;
    }
    if (!session.data?.csrf || server.isPending) return;

    if (!mergePromise) {
      mergePromise = (async () => {
        const current = new Set(serverIds);
        for (const id of guestIds) {
          if (current.has(id)) continue;
          try {
            const result = await legacyRequest<{ ids?: string[] }>('customer.wishlist.toggle', {
              product_id: id,
              csrf: session.data.csrf,
            }, 'POST');
            for (const value of result.ids || []) current.add(String(value));
          } catch {
            // A stale/deleted product must not prevent the remaining ids from
            // being migrated into the account.
          }
        }
        const fresh = await legacyRequest<{ ids?: string[]; products?: any[] }>('customer.wishlist.list');
        const merged = unique(fresh.ids || []);
        clearGuestIds();
        queryClient.setQueryData(['customer.wishlist'], fresh);
        return merged;
      })().finally(() => { mergePromise = null; });
    }
    void mergePromise.then(setIds);
  }, [hydrated, queryClient, server.data, server.isPending, session.data?.csrf, session.isPending, setIds, signedIn]);

  const toggle = useCallback(async (productOrId: string | { id?: unknown }) => {
    const id = String(typeof productOrId === 'string' ? productOrId : productOrId?.id || '').trim();
    if (!id) return false;
    const before = useWishlistState.getState().ids;
    const wasSaved = before.includes(id);
    const optimistic = wasSaved ? before.filter((value) => value !== id) : [id, ...before];
    setIds(optimistic);

    if (!signedIn) {
      writeGuestIds(optimistic);
      return !wasSaved;
    }

    try {
      const result = await legacyRequest<{ added?: boolean; ids?: string[] }>('customer.wishlist.toggle', {
        product_id: id,
        csrf: session.data?.csrf || '',
      }, 'POST');
      setIds(unique(result.ids || optimistic));
      await queryClient.invalidateQueries({ queryKey: ['customer.wishlist'] });
      return Boolean(result.added);
    } catch (error) {
      setIds(before);
      throw error;
    }
  }, [queryClient, session.data?.csrf, setIds, signedIn]);

  return {
    ids,
    count: ids.length,
    ready: hydrated && !session.isPending && (!signedIn || !server.isPending),
    syncing: Boolean(mergePromise) || (signedIn && server.isFetching),
    signedIn,
    products: signedIn ? (server.data?.products || []) : undefined,
    has: (id: unknown) => ids.includes(String(id || '')),
    toggle,
    reload: () => signedIn ? queryClient.invalidateQueries({ queryKey: ['customer.wishlist'] }) : Promise.resolve(),
  };
}
