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
  badge?: string;
  cta?: boolean;
  stockBar?: boolean;
}) {
  const imageCandidates = productImageCandidates(product);
  const [imageIndex, setImageIndex] = useState(0);
  const imageSrc = imageCandidates[imageIndex] || '/legacy-assets/logo.png';
  const add = useCartStore((s) => s.add);
  const wishlist = useWishlist();
  const compare = useCompareStore();
  const quickView = useQuickViewStore();
  const old = productOldPrice(product);
  const variants = Array.isArray((product as any).variants)
    ? (product as any).variants.filter((v: any) => v?.state !== 'hidden' && v?.state !== 'discontinued')
    : [];
  const quickVariantId = variants.length === 1 ? String(variants[0]?.id || '') : '';
  const needsChoice = variants.length > 1;
  const discount = old > product.price && product.price > 0 ? Math.round((1 - product.price / old) * 100) : 0;
  const statusBadge = badge || (typeof product.badge === 'string' ? product.badge : '');
  function addNow() {
    if (needsChoice) {
      quickView.open(product);
      return;
    }
    add(product, 1, quickVariantId);
    trackMarketing('add_to_cart', {
      value: Number(product.price || 0),
      items: [
        {
          id: String(product.id),
          name: product.name,
          price: Number(product.price || 0),
          quantity: 1,
          brand: String(product.brand || ''),
          category: String(product.category || ''),
        },
      ],
    });
    showToast(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`);
  }
  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18 }}
      className="prod-card reveal group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-50">
        <Link href={productHref(product)} aria-label={product.name}>
          <Image
            src={imageSrc}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-contain p-4 transition duration-300 group-hover:scale-[1.03]"
            unoptimized={imageSrc.startsWith('data:')}
            onError={() =>
              setImageIndex((current) => Math.min(current + 1, imageCandidates.length - 1))
            }
          />
        </Link>
        {statusBadge ? (
          <span
            className={`absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-black ${BADGE_STYLES[statusBadge] || 'bg-slate-800 text-white'}`}
          >
            {statusBadge}
          </span>
        ) : null}
        {discount > 0 && (
          <span
            className={`absolute rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white ${statusBadge ? 'left-3 top-11' : 'left-3 top-3'}`}
          >
            {`-${discount}%`}
          </span>
        )}
        {(product as Record<string, unknown>).demo === true && (
          <span className="absolute bottom-3 left-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-black text-amber-950">
            TEST
          </span>
        )}
        <div className="absolute right-3 top-3 flex flex-col gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <button
            type="button"
            onClick={() => quickView.open(product)}
            className="grid size-9 place-items-center rounded-full bg-white shadow"
            aria-label="ดูสินค้าแบบย่อ"
          >
            <Eye size={17} />
          </button>
          <button
            type="button"
            onClick={() =>
              void wishlist
                .toggle(product)
                .then((added) =>
                  showToast(
                    added ? `บันทึก ${product.name} ในรายการโปรดแล้ว` : `นำ ${product.name} ออกจากรายการโปรดแล้ว`,
                  ),
                )
                .catch(() => showToast('บันทึกรายการโปรดไม่สำเร็จ', { tone: 'bad' }))
            }
            className="grid size-9 place-items-center rounded-full bg-white shadow"
            aria-label="รายการโปรด"
          >
            <Heart size={17} fill={wishlist.has(product.id) ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={() => {
              const result = compare.toggle(product);
              if (result === 'needs-confirm') {
                const ok = window.confirm(
                  'สินค้าที่เลือกอยู่คนละหมวดกับรายการเดิม ต้องการล้างรายการเดิมแล้วเริ่มเปรียบเทียบหมวดใหม่นี้หรือไม่?',
                );
                if (ok && compare.confirmSwap())
                  showToast(`เริ่มรายการเปรียบเทียบใหม่ด้วย ${product.name}`, { tone: 'info' });
                else compare.cancelSwap();
                return;
              }
              if (result === 'limit') {
                showToast('เปรียบเทียบได้สูงสุด 4 ชิ้น', { tone: 'bad' });
                return;
              }
              if (result === 'removed')
                showToast(`นำ ${product.name} ออกจากรายการเปรียบเทียบแล้ว`, { tone: 'info' });
              if (result === 'added') showToast(`เพิ่ม ${product.name} ในรายการเปรียบเทียบแล้ว`, { tone: 'info' });
            }}
            className="grid size-9 place-items-center rounded-full bg-white shadow"
            aria-label="เปรียบเทียบ"
            aria-pressed={compare.ids.includes(product.id)}
          >
            <Scale size={17} />
          </button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="min-h-14">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            {product.brand || 'THAISERKIT'}
          </p>
          <Link
            href={productHref(product)}
            className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900 hover:text-emerald-800"
          >
            {product.name}
          </Link>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <strong className={`text-lg ${discount > 0 ? 'text-rose-700' : 'text-emerald-950'}`}>
              {money(Number(product.price))}
            </strong>
            {old > product.price && (
              <del className="ml-2 whitespace-nowrap text-xs text-slate-400">{money(old)}</del>
            )}
            {discount > 0 && (
              <span className="ml-1.5 whitespace-nowrap rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-black text-rose-700">
                {`-${discount}%`}
              </span>
            )}
          </div>
          {!cta && (
            <Button
              size="icon"
              data-cart-add={!needsChoice ? true : undefined}
              onClick={addNow}
              aria-label={needsChoice ? 'เลือกตัวเลือกสินค้า' : 'เพิ่มลงตะกร้า'}
            >
              <ShoppingCart size={18} />
            </Button>
          )}
        </div>
        {cta && (
          <Button
            className="w-full bg-emerald-800 hover:bg-emerald-700"
            data-cart-add={!needsChoice ? true : undefined}
            onClick={addNow}
          >
            <ShoppingCart size={17} />
            เพิ่มลงตะกร้า
          </Button>
        )}
        {stockBar && typeof product.stock === 'number' && <FlashStockBar stock={Number(product.stock)} />}
      </div>
    </motion.article>
  );
}
