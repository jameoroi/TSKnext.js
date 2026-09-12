'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '@/features/catalog/types';

export type CartItem = {
  id: string;
  variant_id?: string;
  variant_label?: string;
  name: string;
  price: number;
  image?: string;
  sku?: string;
  brand?: string;
  qty: number;
  max?: number;
};

export type CartBundleClaim = {
  setId: string;
  name: string;
  slug?: string;
  discountType?: 'none' | 'percent' | 'fixed';
  discountValue?: number;
};

type CartState = {
  items: CartItem[];
  bundleClaim: CartBundleClaim | null;
  add: (product: Product, qty?: number, variantId?: string) => void;
  remove: (id: string, variantId?: string) => void;
  setQty: (id: string, qty: number, variantId?: string) => void;
  clear: () => void;
  replace: (items: CartItem[]) => void;
  setBundleClaim: (claim: CartBundleClaim | null) => void;
};

const LEGACY_CART_KEY = 'tsk_cart';
const NEXT_CART_KEY = 'tsk_next_cart';

function normalizeLegacyCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id || '').trim();
  const name = String(item.name || '').trim();
  const price = Number(item.price);
  if (!id || !name || !Number.isFinite(price)) return null;
  return {
    id,
    variant_id: item.variant_id ? String(item.variant_id) : undefined,
    variant_label: item.variant_label ? String(item.variant_label) : undefined,
    name,
    price,
    image: item.image ? String(item.image) : item.img ? String(item.img) : undefined,
    sku: item.sku ? String(item.sku) : undefined,
    brand: item.brand ? String(item.brand) : undefined,
    qty: Math.max(1, Math.trunc(Number(item.qty) || 1)),
    max: item.max == null ? undefined : Math.max(0, Math.trunc(Number(item.max) || 0)),
  };
}

export function migrateLegacyCartIfNeeded() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(NEXT_CART_KEY)) return false;
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_CART_KEY) || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    const items = parsed.map(normalizeLegacyCartItem).filter((row): row is CartItem => Boolean(row));
    if (!items.length) return false;
    useCartStore.getState().replace(items);
    return true;
  } catch {
    return false;
  }
}

const lineKey = (id: string, variantId = '') => `${id}:${variantId}`;

export const useCartStore = create<CartState>()(persist((set) => ({
  items: [],
  bundleClaim: null,
  add: (product, qty = 1, variantId = '') => set((state) => {
    const id = String(product.id);
    const variants = Array.isArray((product as any).variants) ? (product as any).variants : [];
    const variant = variantId ? variants.find((row: any) => String(row?.id || '') === variantId) : null;
    const max = Number(variant?.available ?? variant?.stock ?? product.available ?? product.stock ?? 9999);
    const amount = Math.max(1, Math.min(max > 0 ? max : 9999, Math.trunc(Number(qty) || 1)));
    const key = lineKey(id, variantId);
    const existing = state.items.find((item) => lineKey(item.id, item.variant_id || '') === key);
    if (existing) return {
      items: state.items.map((item) => lineKey(item.id, item.variant_id || '') === key
        ? { ...item, qty: Math.max(1, Math.min(max > 0 ? max : 9999, item.qty + amount)), max }
        : item),
    };
    return {
      items: [...state.items, {
        id,
        variant_id: variantId || undefined,
        variant_label: variant?.label ? String(variant.label) : undefined,
        name: product.name,
        price: Number(variant?.price ?? product.price ?? 0),
        image: String(product.img || product.imageUrl || product.images?.[0] || ''),
        sku: String(variant?.sku || product.sku || ''),
        brand: String(product.brand || ''),
        qty: amount,
        max,
      }],
    };
  }),
  remove: (id, variantId = '') => set((state) => ({
    items: state.items.filter((item) => lineKey(item.id, item.variant_id || '') !== lineKey(id, variantId)),
  })),
  setQty: (id, qty, variantId = '') => set((state) => ({
    items: state.items.map((item) => lineKey(item.id, item.variant_id || '') === lineKey(id, variantId)
      ? { ...item, qty: Math.max(1, Math.min(item.max || 9999, Math.trunc(qty) || 1)) }
      : item),
  })),
  clear: () => set({ items: [], bundleClaim: null }),
  replace: (items) => set({ items }),
  setBundleClaim: (bundleClaim) => set({ bundleClaim }),
}), {
  name: NEXT_CART_KEY,
  version: 3,
  migrate: (persisted: any) => ({
    ...(persisted && typeof persisted === 'object' ? persisted : {}),
    items: Array.isArray(persisted?.items) ? persisted.items : [],
    bundleClaim: persisted?.bundleClaim && typeof persisted.bundleClaim === 'object' ? persisted.bundleClaim : null,
  }),
}));

export const cartSubtotal = (items: CartItem[]) => items.reduce((sum, item) => sum + item.price * item.qty, 0);
