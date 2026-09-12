'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Eye, ShoppingCart, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCartStore } from '@/features/cart/store';
import { useQuickViewStore } from '@/features/catalog/quick-view';
import { productHref, productImage, productOldPrice } from '@/features/catalog/types';
import { showToast } from '@/features/ui/toast-store';
import { trackMarketing } from '@/lib/marketing.client';

const money = (value: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(
    value || 0,
  );

export function QuickViewModal() {
  const product = useQuickViewStore((state) => state.product);
  const close = useQuickViewStore((state) => state.close);
  const add = useCartStore((state) => state.add);
  if (!product) return null;

  const variants = Array.isArray((product as any).variants)
    ? (product as any).variants.filter((row: any) => row?.state !== 'hidden' && row?.state !== 'discontinued')
    : [];
  const oneVariant = variants.length === 1 ? variants[0] : null;
  const stockRaw = oneVariant?.available ?? oneVariant?.stock ?? product.available ?? product.stock;
  const soldOut = stockRaw != null && Number(stockRaw) <= 0;
  const old = productOldPrice(product);
  const price = Number(oneVariant?.price ?? product.price ?? 0);
  const needsChoice = variants.length > 1;

  function addNow() {
    if (soldOut) return;
    if (needsChoice) return;
    const variantId = oneVariant ? String(oneVariant.id || '') : '';
    add(product!, 1, variantId);
    trackMarketing('add_to_cart', {
      value: price,
      items: [
        {
          id: String(product!.id),
          name: product!.name,
          price,
          quantity: 1,
          brand: String(product!.brand || ''),
          category: String(product!.category || ''),
        },
      ],
    });
    showToast(`เพิ่ม ${product!.name || 'สินค้า'} ลงตะกร้าแล้ว`);
    close();
  }

  return (
    <Dialog.Root
      open={Boolean(product)}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/55 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] max-h-[92dvh] w-[min(920px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border bg-white shadow-2xl outline-none">
          <Dialog.Title className="sr-only">ดูสินค้าแบบย่อ: {product.name}</Dialog.Title>
          <Dialog.Description className="sr-only">
            ดูราคา สถานะสินค้า และเพิ่มลงตะกร้าโดยไม่ออกจากหน้าปัจจุบัน
          </Dialog.Description>
          <Dialog.Close
            className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full border bg-white/95 shadow hover:bg-slate-50"
            aria-label="ปิดหน้าดูสินค้าแบบย่อ"
          >
            <X className="size-5" />
          </Dialog.Close>
          <div className="grid md:grid-cols-[1fr_1fr]">
            <div className="relative aspect-square min-h-72 bg-slate-50 md:aspect-auto">
              <Image
                src={productImage(product)}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-7"
                unoptimized={productImage(product).startsWith('data:')}
              />
            </div>
            <div className="flex flex-col justify-center p-6 md:p-9">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-700">
                {product.brand || 'THAISERKIT SUPPLY'}
              </p>
              <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950 md:text-3xl">
                {product.name}
              </h2>
              <div className="mt-5 flex flex-wrap items-end gap-3">
                <strong className="text-3xl font-black text-emerald-950">
                  {needsChoice
                    ? `เริ่ม ${money(Math.min(...variants.map((row: any) => Number(row.price ?? product.price ?? 0))))}`
                    : money(price)}
                </strong>
                {!needsChoice && old > price ? (
                  <del className="pb-1 text-sm text-slate-400">{money(old)}</del>
                ) : null}
              </div>
              <div
                className={`mt-4 w-fit rounded-full px-3 py-1.5 text-xs font-bold ${soldOut ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}
              >
                {soldOut
                  ? 'สินค้าหมดชั่วคราว'
                  : needsChoice
                    ? `${variants.length} ตัวเลือก · เลือกได้ในหน้าสินค้า`
                    : 'พร้อมสั่งซื้อ · จัดส่งทั่วประเทศ'}
              </div>
              {product.description ? (
                <p className="mt-5 line-clamp-4 text-sm leading-7 text-slate-600">
                  {String(product.description)}
                </p>
              ) : null}
              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                {needsChoice ? (
                  <Link
                    href={productHref(product)}
                    onClick={close}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 text-sm font-bold text-white"
                  >
                    <Eye className="size-4" />
                    เลือกตัวเลือก
                  </Link>
                ) : (
                  <button
                    type="button"
                    data-cart-add
                    onClick={addNow}
                    disabled={soldOut}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-950 px-5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <ShoppingCart className="size-4" />
                    {soldOut ? 'สินค้าหมด' : 'เพิ่มลงตะกร้า'}
                  </button>
                )}
                <Link
                  href={productHref(product)}
                  onClick={close}
                  className="inline-flex h-12 items-center justify-center rounded-xl border px-5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  ดูรายละเอียดทั้งหมด
                </Link>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
