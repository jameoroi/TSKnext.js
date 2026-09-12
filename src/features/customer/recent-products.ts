'use client';

import type { Product } from '@/features/catalog/types';

const KEY = 'tsk_recent_products_r72';
const NEXT_OLD_KEY = 'tsk:recent-products:v1';
const MAX = 8;

type Snapshot = Pick<Product, 'id' | 'name' | 'price'> & Partial<Product> & { viewedAt: string };

export function rememberRecentProduct(product: Product) {
  if (typeof window === 'undefined' || !product?.id) return;
  try {
    const current = readRecentProducts();
    const next: Snapshot = { ...product, viewedAt: new Date().toISOString() };
    const rows = [next, ...current.filter((row) => String(row.id) !== String(product.id))].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    window.dispatchEvent(new Event('tsk:recent-products-change'));
  } catch {}
}

export function readRecentProducts(): Snapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    let parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    if ((!Array.isArray(parsed) || parsed.length === 0) && window.localStorage.getItem(NEXT_OLD_KEY)) {
      parsed = JSON.parse(window.localStorage.getItem(NEXT_OLD_KEY) || '[]');
      if (Array.isArray(parsed)) {
        window.localStorage.setItem(KEY, JSON.stringify(parsed.slice(0, MAX)));
        window.localStorage.removeItem(NEXT_OLD_KEY);
      }
    }
    return Array.isArray(parsed) ? parsed.filter((row) => row && row.id && row.name).slice(0, MAX) : [];
  } catch {
    return [];
  }
}
