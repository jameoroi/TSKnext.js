'use client';

import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cartSubtotal, useCartStore } from '@/features/cart/store';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { orderTotals } from '@/shared/shipping.mjs';

const money = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(
    n || 0,
  );

type BundleQuote = {
  ok: true;
  set: { id: string; name: string; slug?: string };
  eligible_subtotal: number;
  discount: number;
  discount_type: string;
  discount_value: number;
  token: string;
  expires_in: number;
};

type StockProblem = {
  type?: string;
  name?: string;
  requested?: number;
  available?: number;
};

function stockError(error: unknown) {
  const problems =
    error instanceof LegacyApiError
      ? ((error.detail as any)?.problems as StockProblem[] | undefined)
      : undefined;
  if (problems?.length) {
    return problems
      .map((problem) =>
        problem.type === 'insufficient_stock'
          ? `${problem.name || 'สินค้า'}: ต้องการ ${problem.requested ?? 0} ชิ้น แต่พร้อมขาย ${problem.available ?? 0} ชิ้น`
          : `${problem.name || 'สินค้า'}: ไม่พร้อมจำหน่าย`,
      )
      .join(' · ');
  }
  return error instanceof LegacyApiError && error.code !== 'unknown_error'
    ? `ตรวจสอบสต็อกไม่สำเร็จ (${error.code})`
    : 'ตรวจสอบสต็อกไม่สำเร็จ กรุณาลองใหม่';
}

export function CartView() {
  const items = useCartStore((state) => state.items);
  const remove = useCartStore((state) => state.remove);
  const setQty = useCartStore((state) => state.setQty);
  const bundleClaim = useCartStore((state) => state.bundleClaim);
  const setBundleClaim = useCartStore((state) => state.setBundleClaim);
  const [coupon, setCoupon] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [bundleQuote, setBundleQuote] = useState<BundleQuote | null>(null);
  const [bundleError, setBundleError] = useState('');
  const subtotal = cartSubtotal(items);
  const totals = orderTotals(subtotal, { productDiscount: Number(bundleQuote?.discount || 0) });

  useEffect(() => {
    let cancelled = false;
    async function quoteBundle() {
      if (!bundleClaim || !items.length) {
        setBundleQuote(null);
        setBundleError('');
        return;
      }
      try {
        const response = await fetch('/api/kits/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            setId: bundleClaim.setId,
            items: items.map((item) => ({ id: item.id, variant_id: item.variant_id || '', qty: item.qty })),
          }),
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(String(data?.error || `http_${response.status}`));
        if (!cancelled) {
          setBundleQuote(data as BundleQuote);
          setBundleError('');
        }
      } catch (quoteError) {
        if (!cancelled) {
          setBundleQuote(null);
          const code = quoteError instanceof Error ? quoteError.message : 'bundle_quote_failed';
          setBundleError(
            code === 'kit_requirements_not_met'
              ? 'สินค้า Required ในชุดไม่ครบ ส่วนลดชุดจึงถูกพักไว้'
              : `ตรวจส่วนลดชุดไม่ได้ (${code})`,
          );
        }
      }
    }
    void quoteBundle();
    return () => {
      cancelled = true;
    };
  }, [bundleClaim, items]);

  async function goToCheckout() {
    if (!items.length || checking) return;
    setChecking(true);
    setError('');
    try {
      await legacyRequest(
        'checkout.stock.validate',
        {
          items: items.map((item) => ({
            id: item.id,
            variant_id: item.variant_id || '',
            sku: item.sku || '',
            name: item.name,
            qty: item.qty,
          })),
        },
        'POST',
      );
      const code = coupon.trim().toUpperCase();
      window.location.assign(code ? `/checkout?coupon=${encodeURIComponent(code)}` : '/checkout');
    } catch (err) {
      setError(stockError(err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">YOUR CART</p>
        <h1 className="mt-1 text-3xl font-bold">ตะกร้าสินค้า</h1>
      </div>
      {!items.length ? (
        <div className="grid min-h-80 place-items-center rounded-3xl border border-dashed bg-white p-10 text-center">
          <div>
            <ShoppingBag className="mx-auto text-slate-300" size={56} />
            <h2 className="mt-4 text-xl font-bold">ยังไม่มีสินค้าในตะกร้า</h2>
            <Link
              className="mt-5 inline-flex rounded-xl bg-emerald-950 px-6 py-3 font-semibold text-white"
              href="/products"
            >
              เลือกซื้อสินค้า
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
          <section className="space-y-3">
            {items.map((item) => (
              <article
                key={`${item.id}:${item.variant_id || ''}`}
                className="grid grid-cols-[88px_1fr] gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-[110px_1fr_auto]"
              >
                <Link
                  href={`/products/${encodeURIComponent(item.id)}`}
                  className="relative aspect-square overflow-hidden rounded-xl bg-slate-50"
                  aria-label={item.name}
                >
                  {item.image && (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="object-contain"
                      unoptimized={item.image.startsWith('data:')}
                    />
                  )}
                </Link>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {item.brand || 'THAISERKIT SUPPLY'}
                  </p>
                  <Link
                    href={`/products/${encodeURIComponent(item.id)}`}
                    className="font-semibold hover:text-emerald-800"
                  >
                    {item.name}
                  </Link>
                  {item.variant_label && (
                    <p className="mt-1 text-xs font-semibold text-emerald-800">
                      ตัวเลือก: {item.variant_label}
                    </p>
                  )}
                  {item.sku && <p className="mt-1 text-xs text-slate-500">SKU: {item.sku}</p>}
                  <p className="mt-3 text-lg font-bold text-emerald-950">{money(item.price)}</p>
                  <div className="mt-3 inline-flex items-center rounded-xl border">
                    <button
                      type="button"
                      className="grid min-h-10 min-w-10 place-items-center"
                      onClick={() => setQty(item.id, item.qty - 1, item.variant_id)}
                      aria-label="ลดจำนวน"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      className="h-10 w-12 border-x text-center text-sm outline-none"
                      type="number"
                      min={1}
                      max={item.max || undefined}
                      value={item.qty}
                      onChange={(event) => setQty(item.id, Number(event.target.value) || 1, item.variant_id)}
                      aria-label={`จำนวน ${item.name}`}
                    />
                    <button
                      type="button"
                      className="grid min-h-10 min-w-10 place-items-center"
                      onClick={() => setQty(item.id, item.qty + 1, item.variant_id)}
                      aria-label="เพิ่มจำนวน"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  {item.max && item.max < 9999 ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      พร้อมขายสูงสุด {item.max.toLocaleString('th-TH')} ชิ้น
                    </p>
                  ) : null}
                </div>
                <div className="col-span-2 flex items-end justify-between gap-4 sm:col-span-1 sm:flex-col">
                  <strong>{money(item.price * item.qty)}</strong>
                  <button
                    type="button"
                    className="grid min-h-10 min-w-10 place-items-center rounded-xl text-rose-600 hover:bg-rose-50"
                    onClick={() => remove(item.id, item.variant_id)}
                    aria-label="ลบ"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </article>
            ))}
          </section>
          <aside className="h-fit rounded-2xl border bg-white p-5 lg:sticky lg:top-28">
            <h2 className="text-xl font-bold">สรุปคำสั่งซื้อ</h2>
            {bundleClaim ? (
              <div
                className={`mt-4 rounded-xl border p-3 text-xs ${bundleQuote ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <strong>ชุด: {bundleClaim.name}</strong>
                    <p className="mt-1">
                      {bundleQuote
                        ? `ตรวจสิทธิ์ส่วนลดแล้ว${bundleQuote.discount > 0 ? ` · ลด ${money(bundleQuote.discount)}` : ''}`
                        : bundleError || 'กำลังตรวจส่วนลดชุด…'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBundleClaim(null)}
                    className="shrink-0 font-bold underline"
                  >
                    ยกเลิกชุด
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span>ราคาสินค้า</span>
                <span>{money(totals.subtotal)}</span>
              </div>
              {bundleQuote?.discount ? (
                <div className="flex justify-between text-emerald-700">
                  <span>ส่วนลดชุดอุปกรณ์</span>
                  <span>-{money(bundleQuote.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>ค่าจัดส่ง</span>
                <span>{totals.payableShipping ? money(totals.payableShipping) : 'ฟรี'}</span>
              </div>
              {totals.remainingForFreeShipping > 0 && (
                <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  ซื้อเพิ่มอีก {money(totals.remainingForFreeShipping)} เพื่อรับส่งฟรี
                </p>
              )}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <strong>ยอดรวม</strong>
                  <strong className="text-2xl text-emerald-950">{money(totals.total)}</strong>
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <input
                value={coupon}
                onChange={(event) => setCoupon(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void goToCheckout();
                }}
                className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm uppercase outline-none focus:border-emerald-700"
                placeholder="รหัสส่วนลด"
                aria-label="รหัสส่วนลด"
              />
              <button
                type="button"
                disabled={checking}
                onClick={() => void goToCheckout()}
                className="rounded-xl border px-3 text-sm font-bold disabled:opacity-50"
              >
                ใช้โค้ด
              </button>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"
              >
                <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                <span>{error}</span>
              </p>
            )}
            <Button className="mt-5 w-full" size="lg" disabled={checking} onClick={() => void goToCheckout()}>
              {checking ? 'กำลังตรวจสอบสต็อก…' : 'ดำเนินการชำระเงิน'}
            </Button>
            <Link className="mt-3 block text-center text-sm font-semibold text-emerald-800" href="/products">
              เลือกซื้อสินค้าต่อ
            </Link>
            <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">
              ระบบจะตรวจสต็อกจริงอีกครั้งก่อนเปิดหน้าชำระเงิน และคำนวณส่วนลด/ค่าจัดส่งสุดท้ายใน Checkout
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
