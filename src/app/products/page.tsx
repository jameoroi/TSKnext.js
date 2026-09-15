import { X } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ProductCard } from '@/components/commerce/product-card';
import {
  ClearFilters,
  PerPageSelect,
  ProductFilters,
  SortSelect,
} from '@/components/commerce/product-filters';
import { BannerCarousel } from '@/components/content/banner-carousel';
import { getBrands, getCatalogCategories, getProducts } from '@/server/catalog';
import { getPageBanners } from '@/server/page-banners';

export const metadata: Metadata = {
  title: 'สินค้าทั้งหมด | THAISERKIT SUPPLY',
  description: 'เลือกซื้อเครื่องมือช่าง เครื่องมือไฟฟ้า ปั๊มน้ำ และอุปกรณ์การเกษตรคุณภาพจาก THAISERKIT SUPPLY',
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] || '' : v || '');
const PER_PAGE_OPTIONS = [12, 24, 48];
const DEFAULT_PER_PAGE = 24;

function chipHref(current: Record<string, string>, remove: string[]) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (!v || remove.includes(k)) continue;
    params.set(k, v);
  }
  const s = params.toString();
  return `/products${s ? `?${s}` : ''}`;
}

export default async function ProductsPage({ searchParams }: { searchParams: Search }) {
  const s = await searchParams;
  const q = one(s.q);
  const category = one(s.category);
  const brand = one(s.brand);
  const status = one(s.status);
  const sort = one(s.sort) || 'default';
  const minPrice = one(s.min_price);
  const maxPrice = one(s.max_price);
  const page = Math.max(1, Number(one(s.page)) || 1);
  const perPageRaw = Number(one(s.per_page)) || 0;
  const perPage = PER_PAGE_OPTIONS.includes(perPageRaw) ? perPageRaw : DEFAULT_PER_PAGE;

  const params: Record<string, unknown> = { page, per_page: perPage, facets: 1 };
  if (q) params.q = q;
  if (category) params.category = category;
  if (brand) params.brand = brand;
  if (status) params.status = status;
  if (sort !== 'default') params.sort = sort;
  if (minPrice) params.min_price = minPrice;
  if (maxPrice) params.max_price = maxPrice;

  // หมวดต้องตรงกับ bar/header — ใช้แหล่งเดียวกับ header (มี fallback ชุดเดียวกัน)
  const bannerSlidesLoad = getPageBanners('products');
  const [result, categories, brands] = await Promise.all([
    getProducts(params),
    getCatalogCategories(),
    getBrands(),
  ]);

  const total = result.total || result.products.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, pages);
  const keep: Record<string, string> = {
    q,
    category,
    brand,
    status,
    min_price: minPrice,
    max_price: maxPrice,
  };
  const pageHref = (p: number) => {
    const ps = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, sort: sort === 'default' ? '' : sort })) {
      if (v) ps.set(k, v);
    }
    if (perPage !== DEFAULT_PER_PAGE) ps.set('per_page', String(perPage));
    ps.set('page', String(p));
    return `/products?${ps}`;
  };
  const rangeStart = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const rangeEnd = Math.min(total, safePage * perPage);

  const catRows = (Array.isArray(categories) ? categories : []).map((c: Record<string, unknown>) => ({
    key: String(c.key || c.id || c.name || ''),
    name: String(c.name || c.key || ''),
    icon: String(c.icon || ''),
    product_count: typeof c.product_count === 'number' ? c.product_count : null,
  }));
  const brandRows = (Array.isArray(brands) ? brands : []).map((b: Record<string, unknown>) => ({
    id: String(b.id || b.name || ''),
    name: String(b.name || b.id || ''),
  }));
  const activeCategory = catRows.find((c) => c.key === category);
  const heading = q ? `ผลการค้นหา “${q}”` : activeCategory?.name || brand || 'สินค้าทั้งหมด';

  const chips: Array<{ key: string; label: string; remove: string[] }> = [];
  if (q) chips.push({ key: 'q', label: `ค้นหา: ${q}`, remove: ['q'] });
  if (category)
    chips.push({
      key: 'category',
      label: `หมวดหมู่: ${activeCategory?.name || category}`,
      remove: ['category'],
    });
  if (brand) chips.push({ key: 'brand', label: `แบรนด์: ${brand}`, remove: ['brand'] });
  if (status) chips.push({ key: 'status', label: status, remove: ['status'] });
  if (minPrice || maxPrice)
    chips.push({
      key: 'price',
      label: `ราคา ${minPrice || '0'}–${maxPrice || '∞'}`,
      remove: ['min_price', 'max_price'],
    });
  const currentQuery: Record<string, string> = {
    q,
    category,
    brand,
    status,
    min_price: minPrice,
    max_price: maxPrice,
  };

  const onlyCategory = category && !q && !brand && !status && !minPrice && !maxPrice;
  const emptyCategory = Boolean(onlyCategory && activeCategory?.product_count === 0);

  const start = Math.max(1, Math.min(safePage - 2, pages - 4));
  const visible = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  const lastVisible = visible[visible.length - 1] || 1;

  const bannerSlides = await bannerSlidesLoad;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
      <section
        className="relative isolate mb-6 overflow-hidden rounded-3xl bg-emerald-950"
        aria-label="สินค้าคุณภาพ"
      >
        {bannerSlides.length ? (
          <BannerCarousel
            background
            slides={bannerSlides}
            imgClassName="h-full w-full object-cover opacity-60"
          />
        ) : (
          <Image
            src="/legacy-assets/banners/1.webp"
            alt=""
            fill
            priority={false}
            className="-z-10 object-cover opacity-60"
            unoptimized
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-950/90 via-emerald-950/50 to-transparent" />
        <div className="relative p-6 sm:p-8">
          <h2 className="max-w-xl text-2xl font-black leading-snug text-white sm:text-3xl">
            เครื่องมือคุณภาพ เพื่อทุกงานมืออาชีพ
          </h2>
          <p className="mt-1 max-w-xl text-sm text-emerald-50/80">ครบ ครบครัน หลากหลายแบรนด์ชั้นนำ</p>
          <ul className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white">
            {['ของแท้ 100%', 'จัดส่งทั่วไทย', 'รับประกันสินค้า', 'ออกใบกำกับภาษีได้'].map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur"
              >
                <span aria-hidden="true" className="text-amber-300">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-slate-500" aria-label="เส้นทางหน้า">
        <Link href="/" className="hover:text-emerald-800">
          หน้าแรก
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-slate-700">สินค้าทั้งหมด</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">CATALOG</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{heading}</h1>
          <p className="mt-2 text-sm text-slate-500">พบสินค้า {total.toLocaleString('th-TH')} รายการ</p>
        </div>
        <SortSelect value={sort} keep={keep} />
      </div>

      <div className="grid items-start gap-7 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ProductFilters
          q={q}
          category={category}
          brand={brand}
          status={status}
          sort={sort}
          minPrice={minPrice}
          maxPrice={maxPrice}
          categories={catRows}
          brands={brandRows}
          facetCounts={result.facets?.categories || {}}
          brandCounts={result.facets?.brands || {}}
        />

        <div className="min-w-0">
          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <Link
                  key={chip.key}
                  href={chipHref(currentQuery, [...chip.remove, 'page'])}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:border-emerald-400"
                  aria-label={`ลบตัวกรอง ${chip.label}`}
                >
                  {chip.label}
                  <X className="size-3.5" />
                </Link>
              ))}
              <ClearFilters />
            </div>
          )}

          {result.products.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {result.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : emptyCategory ? (
            <div className="rounded-2xl border bg-white p-12 text-center">
              <h2 className="text-xl font-bold">ยังไม่มีสินค้าในหมวด “{activeCategory?.name}” ตอนนี้</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                ทางร้านกำลังทยอยเพิ่มสินค้าในหมวดนี้ ระหว่างนี้ลองดูหมวดอื่นได้เลย
              </p>
              <Link
                href="/products"
                className="mt-6 inline-flex rounded-xl bg-emerald-950 px-6 py-3 text-sm font-bold text-white"
              >
                ดูสินค้าทั้งหมด
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border bg-white p-12 text-center">
              <h2 className="text-xl font-bold">ไม่พบสินค้าที่ตรงกับตัวกรองของคุณ</h2>
              <p className="mt-2 text-sm text-slate-500">ลองเปลี่ยนคำค้นหรือล้างตัวกรองแล้วค้นใหม่</p>
              <div className="mt-6">
                <ClearFilters />
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <p>
              แสดง {rangeStart.toLocaleString('th-TH')} – {rangeEnd.toLocaleString('th-TH')} จาก{' '}
              {total.toLocaleString('th-TH')} รายการ
            </p>
            <PerPageSelect value={perPage} />
          </div>
          {pages > 1 && (
            <nav className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="หน้ารายการสินค้า">
              <Link
                aria-disabled={safePage <= 1}
                href={pageHref(Math.max(1, safePage - 1))}
                className="rounded-xl border bg-white px-4 py-2 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                ก่อนหน้า
              </Link>
              {visible.map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  aria-current={p === safePage ? 'page' : undefined}
                  className={`min-w-10 rounded-xl border px-3 py-2 text-center text-sm ${p === safePage ? 'border-emerald-800 bg-emerald-800 font-bold text-white' : 'bg-white hover:border-emerald-400'}`}
                >
                  {p}
                </Link>
              ))}
              {lastVisible < pages && <span className="px-1 text-slate-400">…</span>}
              {lastVisible < pages && (
                <Link
                  href={pageHref(pages)}
                  className="min-w-10 rounded-xl border bg-white px-3 py-2 text-center text-sm hover:border-emerald-400"
                >
                  {pages}
                </Link>
              )}
              <Link
                aria-disabled={safePage >= pages}
                href={pageHref(Math.min(pages, safePage + 1))}
                className="rounded-xl border bg-white px-4 py-2 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
              >
                ถัดไป
              </Link>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
