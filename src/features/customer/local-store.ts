'use client';

import { create } from 'zustand';
import type { Product } from '@/features/catalog/types';

/**
 * Compare intentionally keeps the legacy `tsk_compare` payload so shoppers do
 * not lose their list during the Nuxt -> Next cut-over and a rollback remains
 * safe. The old storefront stored small product snapshots rather than only ids.
 */
export const COMPARE_LIMIT = 4;
const LEGACY_STORAGE_KEY = 'tsk_compare';
const NEXT_OLD_STORAGE_KEY = 'tsk_next_compare';

export type CompareItem = {
  id: string;
  name: string;
  brand?: string;
  price: number;
  img?: string;
  category: string;
};

export type CompareToggleResult = 'added' | 'removed' | 'limit' | 'needs-confirm' | 'ignored';

type CompareState = {
  items: CompareItem[];
  ids: string[];
  ready: boolean;
  pendingSwap: CompareItem | null;
  hydrate: () => void;
  has: (id: string) => boolean;
  toggle: (product: Product | string) => CompareToggleResult;
  remove: (id: string) => void;
  clear: () => void;
  confirmSwap: () => boolean;
  cancelSwap: () => void;
};

function normalizeCategory(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeItem(value: unknown): CompareItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(row.name || id).trim() || id,
    brand: row.brand ? String(row.brand) : undefined,
    price: Number(row.price) || 0,
    img: row.img || row.image_url || row.imageUrl || row.image ? String(row.img || row.image_url || row.imageUrl || row.image) : undefined,
    category: normalizeCategory(row.category ?? row.category_key ?? row.categoryKey),
  };
}

function toItem(product: Product | string): CompareItem | null {
  if (typeof product === 'string') {
    const id = product.trim();
    return id ? { id, name: id, price: 0, category: '' } : null;
  }
  if (!product?.id) return null;
  return normalizeItem({
    id: product.id,
    name: product.name,
    brand: product.brand,
    price: product.price,
    img: product.img || product.imageUrl || product.images?.[0],
    category: product.category ?? (product as Record<string, unknown>).category_key ?? (product as Record<string, unknown>).categoryKey,
  });
}

function unique(items: CompareItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, COMPARE_LIMIT);
}

function readStored(): CompareItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    if (Array.isArray(legacy)) return unique(legacy.map(normalizeItem).filter((row): row is CompareItem => Boolean(row)));
  } catch {}

  // One migration pass for early Next builds that persisted only ids under
  // `tsk_next_compare`. We keep the old key untouched so rollback stays safe.
  try {
    const previous = JSON.parse(window.localStorage.getItem(NEXT_OLD_STORAGE_KEY) || 'null');
    const ids = Array.isArray(previous?.state?.ids) ? previous.state.ids : Array.isArray(previous?.ids) ? previous.ids : [];
    return unique(ids.map((id: unknown) => normalizeItem({ id, name: id, price: 0, category: '' })).filter((row: CompareItem | null): row is CompareItem => Boolean(row)));
  } catch {
    return [];
  }
}

function persist(items: CompareItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(items));
    window.localStorage.removeItem(NEXT_OLD_STORAGE_KEY);
    window.dispatchEvent(new Event('tsk:compare-change'));
  } catch {}
}

function snapshot(items: CompareItem[]) {
  const next = unique(items);
  return { items: next, ids: next.map((item) => item.id) };
}

export const useCompareStore = create<CompareState>((set, get) => ({
  items: [],
  ids: [],
  ready: false,
  pendingSwap: null,

  hydrate: () => {
    if (get().ready) return;
    const stored = readStored();
    set({ ...snapshot(stored), ready: true });
    if (stored.length) persist(stored);
  },

  has: (id) => get().ids.includes(String(id)),

  toggle: (product) => {
    const item = toItem(product);
    if (!item) return 'ignored';
    const state = get();

    if (state.ids.includes(item.id)) {
      const next = state.items.filter((row) => row.id !== item.id);
      persist(next);
      set({ ...snapshot(next), pendingSwap: null });
      return 'removed';
    }

    const category = state.items[0]?.category || '';
    if (state.items.length && item.category && category && item.category !== category) {
      set({ pendingSwap: item });
      return 'needs-confirm';
    }

    if (state.items.length >= COMPARE_LIMIT) return 'limit';

    const next = [...state.items, item];
    persist(next);
    set({ ...snapshot(next), pendingSwap: null });
    return 'added';
  },

  remove: (id) => {
    const next = get().items.filter((row) => row.id !== String(id));
    persist(next);
    set({ ...snapshot(next), pendingSwap: null });
  },

  clear: () => {
    persist([]);
    set({ items: [], ids: [], pendingSwap: null });
  },

  confirmSwap: () => {
    const item = get().pendingSwap;
    if (!item) return false;
    persist([item]);
    set({ ...snapshot([item]), pendingSwap: null });
    return true;
  },

  cancelSwap: () => set({ pendingSwap: null }),
}));

export function compareShareLink(ids: string[]) {
  return ids.length ? `/compare?ids=${ids.slice(0, COMPARE_LIMIT).map(encodeURIComponent).join(',')}` : '/compare';
}
