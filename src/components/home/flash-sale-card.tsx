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
    <article className="group relative overflow-hidden rounded-2xl bg-white text-slate-900 shadow-lg">
      <div className="relative aspect-square overflow-hidden bg-slate-50">
        <Link href={productHref(product)} aria-label={product.name}>
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-contain p-4 transition duration-300 group-hover:scale-[1.03]"
            unoptimized
            onError={() => setImageIndex((current) => Math.min(current + 1, imageCandidates.length - 1))}
          />
        </Link>
        {discountPercent > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">
            ลด {discountPercent}%
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
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
        <div className="flex items-baseline gap-2">
          <strong className="text-lg font-black text-rose-700">{money(salePrice)}</strong>
          <del className="text-xs text-slate-400">{money(normalPrice)}</del>
        </div>
        {stockQuantity != null && <FlashStockBar stock={stockQuantity} />}
        {soldQuantity != null ? (
          <p className="text-[11px] font-bold text-slate-500">
            ขายแล้ว {soldQuantity.toLocaleString('th-TH')} ชิ้น
          </p>
        ) : null}
        {startsAt || endsAt ? (
          <p className="text-[11px] text-slate-400">
            {[startsAt ? 'เริ่ม ' + startsAt : '', endsAt ? 'ถึง ' + endsAt : ''].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <Button className="w-full bg-rose-600 hover:bg-rose-500" onClick={addNow} aria-label="เพิ่มลงตะกร้า">
          <ShoppingCart size={17} />
          เพิ่มลงตะกร้า
        </Button>
      </div>
    </article>
  );
}
