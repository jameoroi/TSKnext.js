'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Plus, Scale, ShoppingCart, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCartStore } from '@/features/cart/store';
import { type Product, productHref } from '@/features/catalog/types';
import { COMPARE_LIMIT, compareShareLink, useCompareStore } from '@/features/customer/local-store';
import { showToast } from '@/features/ui/toast-store';
import { legacyRequest } from '@/lib/legacy-api.client';

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  });

function imageOf(product: Product) {
  return String(product.image_url || product.img || product.imageUrl || product.images?.[0] || '').trim();
}

function stockLabel(product: Product) {
  const raw = product.available ?? product.stock;
  if (raw === null || raw === undefined) return 'พร้อมจัดส่ง';
  const stock = Number(raw);
  return stock > 0 ? `พร้อมส่ง ${stock.toLocaleString('th-TH')} ชิ้น` : 'สินค้าหมด';
}

function specValue(product: Product, key: string) {
  const value = product.specs?.[key];
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

function numericOf(value: string) {
  const match = String(value)
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function bestIndexes(values: string[], lowerIsBetter = false) {
  const numbers = values.map(numericOf);
  const comparable = numbers.filter((value): value is number => value !== null);
  if (comparable.length < 2) return [];
  const best = lowerIsBetter ? Math.min(...comparable) : Math.max(...comparable);
  if (comparable.every((value) => value === best)) return [];
  return numbers.map((value, index) => (value === best ? index : -1)).filter((index) => index >= 0);
}

export function CompareProducts() {
  const router = useRouter();
  const search = useSearchParams();
  const compare = useCompareStore();
  const add = useCartStore((state) => state.add);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    compare.hydrate();
  }, [compare]);

  const queryIds = useMemo(
    () =>
      String(search.get('ids') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, COMPARE_LIMIT),
    [search],
  );

  const ids = queryIds.length ? queryIds : compare.ids;
  const query = useQuery({
    queryKey: ['compare-products', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(
        ids.map((id) =>
          legacyRequest<{ product?: Product }>('products.get', { id, slug: id }).catch(() => ({
            product: undefined,
          })),
        ),
      );
      return rows.map((row) => row.product).filter(Boolean) as Product[];
    },
  });

  const products = query.data || [];
  const specKeys = useMemo(() => {
    const keys: string[] = [];
    for (const product of products) {
      for (const key of Object.keys(product.specs || {})) if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }, [products]);
  const bestPrice = useMemo(
    () =>
      bestIndexes(
        products.map((product) => String(Number(product.price) || 0)),
        true,
      ),
    [products],
  );
  const bestBySpec = useMemo(
    () =>
      Object.fromEntries(
        specKeys.map((key) => [key, bestIndexes(products.map((product) => specValue(product, key)))]),
      ) as Record<string, number[]>,
    [products, specKeys],
  );

  function updateUrl(nextIds: string[]) {
    router.replace(compareShareLink(nextIds), { scroll: false });
  }

  function removeProduct(id: string) {
    compare.remove(id);
    updateUrl(ids.filter((value) => value !== id));
  }

  function clearAll() {
    compare.clear();
    router.replace('/compare', { scroll: false });
  }

  async function copyShareLink() {
    const path = compareShareLink(ids);
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      showToast('คัดลอกลิงก์เปรียบเทียบแล้ว', { tone: 'info' });
    } catch {
      showToast('คัดลอกลิงก์ไม่สำเร็จ', { tone: 'bad' });
    }
  }

  function addToCart(product: Product) {
    const variants = Array.isArray(product.variants)
      ? (product.variants as Array<Record<string, unknown>>).filter(
          (row) => row?.state !== 'hidden' && row?.state !== 'discontinued',
        )
      : [];
    if (variants.length > 1) {
      router.push(productHref(product));
      showToast('กรุณาเลือกตัวเลือกสินค้าก่อนเพิ่มลงตะกร้า', { tone: 'info' });
      return;
    }
    const variantId = variants.length === 1 ? String(variants[0]?.id || '') : '';
    add(product, 1, variantId);
    showToast(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`);
  }

  if (!compare.ready && !queryIds.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          กำลังโหลดรายการเปรียบเทียบ…
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
      <nav className="mb-5 text-sm text-slate-500" aria-label="เส้นทางหน้า">
        <Link href="/" className="hover:text-emerald-800">
          หน้าแรก
        </Link>
        <span className="px-2">›</span>
        <span>เปรียบเทียบสินค้า</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Scale className="text-emerald-800" />
            <h1 className="text-3xl font-black">เปรียบเทียบสินค้า</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            เปรียบเทียบได้สูงสุด {COMPARE_LIMIT} รายการในหมวดหมู่เดียวกัน · ค่าตัวเลขที่ดีที่สุดของแต่ละแถวจะถูกไฮไลต์
          </p>
        </div>
        {ids.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyShareLink()}>
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์แชร์'}
            </Button>
            <Button variant="outline" onClick={clearAll}>
              <Trash2 size={16} />
              ล้างทั้งหมด
            </Button>
          </div>
        ) : null}
      </div>

      {query.isPending && ids.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          กำลังโหลดข้อมูลสินค้า…
        </div>
      ) : null}
      {!query.isPending && products.length === 0 ? (
        <section
          className="page-panel mt-8 overflow-hidden p-6 sm:p-10 lg:p-14"
          aria-label="รายการเปรียบเทียบว่าง"
        >
          <div className="grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr]">
            <div className="max-w-xl">
              <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">
                COMPARE TO DECIDE
              </p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-emerald-950 sm:text-4xl">
                ยังไม่มีสินค้า
                <br />
                ในรายการเปรียบเทียบ
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-500">
                เลือกสินค้าที่คุณสนใจเพื่อเปรียบเทียบสเปก คุณสมบัติ และราคาในมุมมองเดียวกัน ช่วยให้ตัดสินใจได้ง่ายขึ้น
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className={buttonVariants()} href="/products">
                  เลือกดูสินค้า
                </Link>
                <Link className={buttonVariants({ variant: 'outline' })} href="/products?featured=1">
                  ดูสินค้าแนะนำ
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-3 items-end gap-3 sm:gap-5" aria-hidden="true">
              {[1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className={`grid aspect-[.72] place-items-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/35 p-3 ${slot === 2 ? '-translate-y-5' : ''}`}
                >
                  <span className="grid size-12 place-items-center rounded-full bg-emerald-800 text-white shadow-lg">
                    <Plus className="size-6" />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-5 rounded-2xl bg-emerald-50/70 p-5 sm:grid-cols-3 sm:p-6">
            {[
              ['1. เลือกสินค้า', 'คลิกไอคอนเปรียบเทียบในหน้าสินค้า'],
              ['2. ดูรายละเอียด', 'เปรียบเทียบสเปก ราคา และแบรนด์'],
              ['3. ตัดสินใจง่ายขึ้น', 'เลือกสินค้าที่เหมาะกับงานของคุณ'],
            ].map(([title, body]) => (
              <div key={title} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-emerald-800 shadow-sm">
                  <Scale className="size-5" />
                </span>
                <div>
                  <strong className="block text-sm text-emerald-950">{title}</strong>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{body}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {products.length > 0 ? (
        <div className="mt-8 overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 align-top">
                <th scope="row" className="sticky left-0 z-10 w-44 min-w-44 bg-slate-50 p-4 text-left">
                  สินค้า
                </th>
                {products.map((product) => (
                  <th
                    key={product.id}
                    scope="col"
                    className="relative min-w-56 p-4 text-center font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => removeProduct(String(product.id))}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-full border bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600"
                      aria-label={`นำ ${product.name} ออกจากการเปรียบเทียบ`}
                    >
                      ×
                    </button>
                    <Link
                      href={productHref(product)}
                      className="mx-auto grid max-w-48 justify-items-center gap-2"
                    >
                      {imageOf(product) ? (
                        <Image
                          src={imageOf(product)}
                          alt={product.name}
                          width={128}
                          height={128}
                          className="size-32 rounded-xl bg-white object-contain p-2"
                          unoptimized
                        />
                      ) : (
                        <span className="grid size-32 place-items-center rounded-xl bg-slate-50 text-xs font-bold text-slate-400">
                          ยังไม่มีรูปจากหลังบ้าน
                        </span>
                      )}
                      <span className="line-clamp-3">{product.name}</span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CompareRow label="ราคา">
                {products.map((product, index) => (
                  <Cell key={`price-${product.id}`} best={bestPrice.includes(index)}>
                    <b className="text-base text-rose-600">{money(product.price)}</b>
                  </Cell>
                ))}
              </CompareRow>
              <CompareRow label="แบรนด์">
                {products.map((product) => (
                  <Cell key={`brand-${product.id}`}>{product.brand || '-'}</Cell>
                ))}
              </CompareRow>
              <CompareRow label="สถานะสินค้า">
                {products.map((product) => (
                  <Cell key={`stock-${product.id}`}>{stockLabel(product)}</Cell>
                ))}
              </CompareRow>
              <CompareRow label="SKU">
                {products.map((product) => (
                  <Cell key={`sku-${product.id}`}>{product.sku || '-'}</Cell>
                ))}
              </CompareRow>
              {specKeys.map((key) => (
                <CompareRow key={key} label={key}>
                  {products.map((product, index) => (
                    <Cell key={`${key}-${product.id}`} best={bestBySpec[key]?.includes(index)}>
                      {specValue(product, key)}
                    </Cell>
                  ))}
                </CompareRow>
              ))}
              <CompareRow label="">
                {products.map((product) => (
                  <Cell key={`buy-${product.id}`}>
                    <Button onClick={() => addToCart(product)}>
                      <ShoppingCart size={16} />
                      เพิ่มลงตะกร้า
                    </Button>
                  </Cell>
                ))}
              </CompareRow>
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}

function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <th
        scope="row"
        className="sticky left-0 z-10 w-44 min-w-44 bg-slate-50 p-4 text-left font-semibold text-slate-600"
      >
        {label}
      </th>
      {children}
    </tr>
  );
}

function Cell({ children, best = false }: { children: React.ReactNode; best?: boolean }) {
  return (
    <td className={`min-w-56 p-4 align-top ${best ? 'bg-emerald-50 font-bold text-emerald-800' : ''}`}>
      {children}
    </td>
  );
}
