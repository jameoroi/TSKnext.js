'use client';

import { ShoppingCart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/features/cart/store';
import { productHref, productImageCandidates } from '@/features/catalog/types';
import { showToast } from '@/features/ui/toast-store';
import type { FlashSaleItem } from '@/server/homepage';
import { FlashStockBar } from '../commerce/flash-stock-bar';

const money = (value: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(
    value || 0,
  );

export function FlashSaleCard({ item }: { item: FlashSaleItem }) {
  const add = useCartStore((s) => s.add);
  const { product, normalPrice, salePrice, discountPercent, stockQuantity, soldQuantity, startsAt, endsAt } =
    item;
  const imageCandidates = productImageCandidates(product);
  const [imageIndex, setImageIndex] = useState(0);
  const image = imageCandidates[imageIndex] || '/legacy-assets/logo.png';

  function addNow() {
    add(product, 1);
    showToast('เพิ่มสินค้าลงตะกร้าแล้ว');
  }

  return (
    <article className="tsk-pop group relative overflow-hidden rounded-2xl bg-white text-slate-900 shadow-lg">
      <div className="relative aspect-square overflow-hidden bg-slate-50">
        <Link href={productHref(product)} aria-label={product.name}>
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain"
            unoptimized={image.startsWith('data:')}
            onError={() => setImageIndex((current) => Math.min(current + 1, imageCandidates.length - 1))}
          />
        </Link>
        {discountPercent > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-black text-white sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
            ลด {discountPercent}%
          </span>
        )}
      </div>
      <div className="space-y-2 p-3 sm:p-4">
        {product.brand ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {String(product.brand)}
          </p>
        ) : null}
        <Link
          href={productHref(product)}
          className="line-clamp-2 min-h-10 text-sm font-semibold hover:text-rose-700"
        >
          {product.name}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <strong className="text-base font-black text-rose-700 sm:text-lg">{money(salePrice)}</strong>
          <del className="shrink-0 text-xs text-slate-400">{money(normalPrice)}</del>
        </div>
        {stockQuantity != null && <FlashStockBar stock={stockQuantity} />}
        {soldQuantity != null ? (
          <p className="text-[11px] font-bold text-slate-500">
            ขายแล้ว {soldQuantity.toLocaleString('th-TH')} ชิ้น
          </p>
        ) : null}
        {startsAt || endsAt ? (
          <p className="text-[11px] text-slate-400">
            {[startsAt ? `เริ่ม ${startsAt}` : '', endsAt ? `ถึง ${endsAt}` : ''].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <Button
          className="h-10 w-full gap-1.5 bg-rose-600 px-2 text-xs hover:bg-rose-500 sm:h-11 sm:text-sm"
          onClick={addNow}
          aria-label="เพิ่มลงตะกร้า"
        >
          <ShoppingCart size={17} />
          เพิ่มลงตะกร้า
        </Button>
      </div>
    </article>
  );
}
