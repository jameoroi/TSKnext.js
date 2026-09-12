'use client';

import { Copy, Heart, QrCode, Scale, Share2, ShoppingCart, X, Zap } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/features/cart/store';
import { type Product, productOldPrice } from '@/features/catalog/types';
import { useCompareStore } from '@/features/customer/local-store';
import { rememberRecentProduct } from '@/features/customer/recent-products';
import { useWishlist } from '@/features/customer/wishlist';
import { showToast } from '@/features/ui/toast-store';
import { legacyRequest } from '@/lib/legacy-api.client';
import { trackMarketing } from '@/lib/marketing.client';

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  });

export function ProductDetailActions({ product }: { product: Product }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const variants = useMemo(
    () =>
      (Array.isArray((product as any).variants) ? (product as any).variants : []).filter(
        (variant: any) => variant?.state !== 'hidden' && variant?.state !== 'discontinued',
      ),
    [product],
  );
  const requestedVariant = searchParams.get('variant') || '';
  const [variantId, setVariantId] = useState(() => {
    if (variants.some((row: any) => String(row?.id || '') === requestedVariant)) return requestedVariant;
    return variants.length === 1 ? String(variants[0]?.id || '') : '';
  });
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [wishlistError, setWishlistError] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<{ image: string; url: string; sku?: string; barcode?: string } | null>(
    null,
  );
  const [shareNotice, setShareNotice] = useState('');
  const viewTracked = useRef('');
  const add = useCartStore((state) => state.add);
  const wishlist = useWishlist();
  const compare = useCompareStore();
  const chosen = variants.find((row: any) => String(row?.id || '') === variantId) || null;
  const preview =
    variants.length > 0
      ? [...variants].sort(
          (a: any, b: any) => Number(a?.price ?? product.price ?? 0) - Number(b?.price ?? product.price ?? 0),
        )[0]
      : null;
  const displayVariant = chosen || preview;
  const needsChoice = variants.length > 1 && !chosen;
  const differentVariantPrices =
    new Set(variants.map((row: any) => Number(row?.price ?? product.price ?? 0))).size > 1;
  const price = Number(displayVariant?.price ?? product.price ?? 0);
  const oldPrice = productOldPrice(product);
  const stockRaw = displayVariant?.available ?? displayVariant?.stock ?? product.available ?? product.stock;
  const stock = stockRaw == null ? 9999 : Number(stockRaw);
  const soldOut = stock <= 0;
  const discount =
    !needsChoice && oldPrice > price && price > 0 ? Math.round((1 - price / oldPrice) * 100) : 0;

  useEffect(() => {
    // One product-view event per mounted PDP. Variant changes are choices inside the same view.
    if (viewTracked.current === String(product.id)) return;
    viewTracked.current = String(product.id);
    rememberRecentProduct(product);
    trackMarketing('view_item', {
      value: price,
      items: [
        {
          id: String(product.id),
          name: product.name,
          price,
          brand: String(product.brand || ''),
          category: String(product.category || ''),
        },
      ],
    });
  });

  function addToCart() {
    if (variants.length > 0 && !chosen) {
      setError('กรุณาเลือกตัวเลือกสินค้าก่อน');
      return false;
    }
    if (soldOut) return false;
    setError('');
    add(product, qty, variantId);
    trackMarketing('add_to_cart', {
      value: price * qty,
      items: [
        {
          id: String(product.id),
          name: product.name,
          price,
          quantity: qty,
          brand: String(product.brand || ''),
          category: String(product.category || ''),
        },
      ],
    });
    showToast(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`);
    return true;
  }

  function chooseVariant(id: string) {
    setVariantId(id);
    setQty(1);
    setError('');
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('variant', id);
    else params.delete('variant');
    router.replace(`${window.location.pathname}${params.size ? `?${params.toString()}` : ''}`, {
      scroll: false,
    });
  }

  async function toggleWishlist() {
    setWishlistError('');
    try {
      await wishlist.toggle(product);
    } catch {
      setWishlistError('บันทึกรายการโปรดไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  }

  async function openQr() {
    if (variants.length > 1 && !chosen) {
      setError('กรุณาเลือกตัวเลือกสินค้าก่อนสร้าง QR');
      return;
    }
    setQrBusy(true);
    setShareNotice('');
    try {
      const answer = await legacyRequest<{ url?: string; data_url?: string; sku?: string; barcode?: string }>(
        'products.qr',
        {
          id: product.id,
          variant_id: chosen?.id || variantId || undefined,
        },
      );
      const url = String(answer.url || window.location.href);
      let image = String(answer.data_url || '');
      if (!image) {
        const QRCode = await import('qrcode');
        image = await QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
      }
      setQrData({ image, url, sku: answer.sku, barcode: answer.barcode });
      setQrOpen(true);
    } catch {
      setShareNotice('สร้าง QR ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setQrBusy(false);
    }
  }

  async function shareProduct() {
    const url = qrData?.url || window.location.href;
    setShareNotice('');
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: product.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNotice('คัดลอกลิงก์สินค้าแล้ว');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setShareNotice('แชร์ไม่สำเร็จ กรุณาคัดลอกลิงก์จากแถบที่อยู่');
    }
  }

  async function copyQrUrl() {
    if (!qrData?.url) return;
    try {
      await navigator.clipboard.writeText(qrData.url);
      setShareNotice('คัดลอกลิงก์สินค้าแล้ว');
    } catch {
      setShareNotice('คัดลอกลิงก์ไม่สำเร็จ');
    }
  }

  return (
    <>
      <div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            {needsChoice && differentVariantPrices && (
              <span className="block text-xs font-semibold text-slate-500">ราคาเริ่มต้น</span>
            )}
            <strong className="text-4xl font-black text-emerald-950">{money(price)}</strong>
          </div>
          {!needsChoice && oldPrice > price && (
            <del className="pb-1 text-lg text-slate-400">{money(oldPrice)}</del>
          )}
          {discount > 0 && (
            <span className="mb-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
              ประหยัด {discount}%
            </span>
          )}
        </div>

        <div
          className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${soldOut ? 'bg-rose-50 text-rose-700' : stock < 6 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}
        >
          <span
            className={`size-2 rounded-full ${soldOut ? 'bg-rose-500' : stock < 6 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          />
          {soldOut
            ? 'สินค้าหมดชั่วคราว'
            : stockRaw == null
              ? 'พร้อมจัดส่ง'
              : stock < 6
                ? `เหลือเพียง ${stock.toLocaleString('th-TH')} ชิ้น`
                : `พร้อมส่ง ${stock.toLocaleString('th-TH')} ชิ้น`}
        </div>

        {variants.length > 0 && (
          <label className="mt-6 block" htmlFor="pdp-variant">
            <span className="mb-2 block text-sm font-bold">ตัวเลือกสินค้า</span>
            <select
              id="pdp-variant"
              value={variantId}
              onChange={(event) => chooseVariant(event.target.value)}
              className={`h-12 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-emerald-700 ${error ? 'border-rose-500' : ''}`}
              aria-invalid={Boolean(error)}
            >
              {variants.length > 1 && <option value="">เลือกตัวเลือก</option>}
              {variants.map((row: any) => {
                const available = Number(row?.available ?? row?.stock ?? 1);
                return (
                  <option
                    key={String(row.id || row.label)}
                    value={String(row.id || '')}
                    disabled={available <= 0}
                  >
                    {row.label || row.sku || 'ตัวเลือก'} · {money(row.price ?? product.price)}
                    {available <= 0 ? ' · หมด' : ''}
                  </option>
                );
              })}
            </select>
            {error && (
              <span className="mt-1.5 block text-xs font-semibold text-rose-600" role="alert">
                {error}
              </span>
            )}
            {chosen?.sku && (
              <span className="mt-1.5 block text-xs text-slate-500">SKU: {String(chosen.sku)}</span>
            )}
          </label>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex h-11 items-center rounded-xl border bg-white">
            <button
              type="button"
              className="h-full px-3 text-lg"
              aria-label="ลดจำนวน"
              onClick={() => setQty(Math.max(1, qty - 1))}
            >
              −
            </button>
            <input
              value={qty}
              min={1}
              max={soldOut ? 1 : stock}
              type="number"
              inputMode="numeric"
              aria-label="จำนวนสินค้า"
              onChange={(event) =>
                setQty(
                  Math.max(1, Math.min(soldOut ? 1 : stock, Math.trunc(Number(event.target.value) || 1))),
                )
              }
              className="w-12 border-x py-2 text-center outline-none"
            />
            <button
              type="button"
              className="h-full px-3 text-lg"
              aria-label="เพิ่มจำนวน"
              onClick={() => setQty(Math.min(soldOut ? 1 : stock, qty + 1))}
            >
              +
            </button>
          </div>
          <Button size="lg" data-cart-add className="min-w-44 flex-1" onClick={addToCart} disabled={soldOut}>
            <ShoppingCart size={18} />
            {soldOut ? 'สินค้าหมด' : 'เพิ่มลงตะกร้า'}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              if (addToCart()) router.push('/cart');
            }}
            disabled={soldOut}
          >
            <Zap size={18} />
            ซื้อเลย
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void toggleWishlist()}
            aria-pressed={wishlist.has(product.id)}
          >
            <Heart size={17} fill={wishlist.has(product.id) ? 'currentColor' : 'none'} />
            {wishlist.has(product.id) ? 'บันทึกแล้ว' : 'รายการโปรด'}
          </Button>
          <Button
            type="button"
            variant="outline"
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
            aria-pressed={compare.ids.includes(product.id)}
          >
            <Scale size={17} />
            {compare.ids.includes(product.id) ? 'กำลังเปรียบเทียบ' : 'เปรียบเทียบ'}
          </Button>
          <Button type="button" variant="outline" onClick={() => void openQr()} disabled={qrBusy}>
            <QrCode size={17} />
            {qrBusy ? 'กำลังสร้าง…' : 'QR สินค้า'}
          </Button>
          <Button type="button" variant="outline" onClick={() => void shareProduct()}>
            <Share2 size={17} />
            แชร์
          </Button>
        </div>
        {wishlistError && <p className="mt-2 text-xs font-semibold text-rose-600">{wishlistError}</p>}
        {shareNotice && (
          <p
            className={`mt-2 text-xs font-semibold ${shareNotice.includes('แล้ว') ? 'text-emerald-700' : 'text-rose-600'}`}
          >
            {shareNotice}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ['รับประกันสินค้า', 'ของแท้ ตรวจสอบได้'],
            ['จัดส่งทั่วประเทศ', 'ติดตามพัสดุได้'],
            ['ใบกำกับภาษี', 'รองรับนิติบุคคล'],
            ['บริการหลังการขาย', 'มีทีมงานดูแล'],
          ].map(([title, note]) => (
            <div key={title} className="rounded-xl bg-slate-50 p-3">
              <strong className="block text-slate-800">{title}</strong>
              <span className="mt-1 block text-slate-500">{note}</span>
            </div>
          ))}
        </div>

        {qrOpen && qrData && (
          <div
            className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="QR สินค้า"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setQrOpen(false);
            }}
          >
            <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.15em] text-emerald-700">Product QR</p>
                  <h2 className="mt-1 line-clamp-2 text-xl font-black">{product.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setQrOpen(false)}
                  className="grid size-9 shrink-0 place-items-center rounded-full border"
                  aria-label="ปิด"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="mx-auto mt-5 grid max-w-[330px] place-items-center rounded-3xl border bg-white p-3">
                <img
                  src={qrData.image}
                  alt={`QR สำหรับ ${product.name}`}
                  width={320}
                  height={320}
                  className="aspect-square w-full"
                />
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {qrData.sku && (
                  <p>
                    <b>SKU:</b> {qrData.sku}
                  </p>
                )}
                {qrData.barcode && (
                  <p className="mt-1">
                    <b>Barcode:</b> {qrData.barcode}
                  </p>
                )}
                <p className="mt-1 break-all">{qrData.url}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => void copyQrUrl()}>
                  <Copy size={16} />
                  คัดลอกลิงก์
                </Button>
                <Button type="button" onClick={() => void shareProduct()}>
                  <Share2 size={16} />
                  แชร์สินค้า
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-white/95 px-4 py-2.5 shadow-[0_-8px_30px_rgba(15,23,42,.12)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-500">{product.name}</p>
            <p className="text-base font-black text-emerald-950">{money(price)}</p>
          </div>
          <Button
            type="button"
            disabled={soldOut}
            onClick={() => {
              if (addToCart()) return;
              if (variants.length > 0 && !chosen) {
                document
                  .getElementById('pdp-variant')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                document.getElementById('pdp-variant')?.focus({ preventScroll: true });
              }
            }}
          >
            <ShoppingCart size={17} />
            {soldOut ? 'สินค้าหมด' : 'เพิ่มลงตะกร้า'}
          </Button>
        </div>
      </div>
    </>
  );
}
