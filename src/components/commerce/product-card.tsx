'use client';


import { Eye, Heart, Scale, ShoppingCart } from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/features/cart/store';
import { useQuickViewStore } from '@/features/catalog/quick-view';
import {
  type Product,
  productHref,
  productImageCandidates,
  productOldPrice,
} from '@/features/catalog/types';
import { useCompareStore } from '@/features/customer/local-store';
import { useWishlist } from '@/features/customer/wishlist';
import { showToast } from '@/features/ui/toast-store';
import { trackMarketing } from '@/lib/marketing.client';
import { FlashStockBar } from './flash-stock-bar';


const money = (value: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(
    value || 0,
  );


const BADGE_STYLES: Record<string, string> = {
  ขายดี: 'bg-rose-600 text-white',
  สินค้าใหม่: 'bg-emerald-600 text-white',
  ลดพิเศษ: 'bg-orange-500 text-white',
  แนะนำ: 'bg-amber-400 text-amber-950',
};


export function ProductCard({
  product,
  badge,
  cta,
  stockBar,
}: {
  product: Product;
