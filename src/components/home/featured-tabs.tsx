'use client';

import Link from 'next/link';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { ProductCard } from '@/components/commerce/product-card';
import { ProductCardPlaceholder } from '@/components/home/placeholders';
import { SaleCountdown } from '@/components/home/sale-countdown';
import type { Product } from '@/features/catalog/types';

type TabKey = 'popular' | 'new' | 'sale';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'popular', label: 'สินค้ายอดนิยม' },
  { key: 'new', label: 'สินค้าใหม่' },
  { key: 'sale', label: 'สินค้าลดราคา' },
];

/**
 * สินค้าแนะนำแบบแท็บ + การ์ด Flash Sale ข้าง ๆ (ตาม mockup หน้าแรก)
 * popular = สินค้าขายดี, new = มาใหม่, sale = ลดราคา — ข้อมูลจริงจากหลังบ้านล้วน
 */
export function FeaturedTabs({
  popular,
  fresh,
  sale,
  flashEndsAt,
}: {
  popular: Product[];
  fresh: Product[];
  sale: Product[];
  flashEndsAt: string;
}) {
  const [tab, setTab] = useState<TabKey>('popular');
  const lists: Record<TabKey, Product[]> = { popular, new: fresh, sale };
  const items = lists[tab].slice(0, 5);
  const missingIds = Array.from(
    { length: Math.max(0, 5 - items.length) },
    (_, i) => `featured-tab-ph-${i + 1}`,
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_280px]">
      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as TabKey)} className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-2xl font-bold">สินค้าแนะนำ สำหรับคุณ</h2>
          <Tabs.List className="flex flex-wrap items-center gap-2" aria-label="กลุ่มสินค้าแนะนำ">
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.key}
                value={t.key}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  tab === t.key
                    ? 'bg-emerald-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Link
            href="/products"
            className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-emerald-800"
          >
            ดูทั้งหมด →
          </Link>
        </div>
        <Tabs.Content value={tab} className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
          {missingIds.map((id) => (
            <ProductCardPlaceholder key={id} />
          ))}
        </Tabs.Content>
      </Tabs.Root>
      <aside
        className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700 p-5 text-white shadow-lg"
        aria-label="สินค้าราคาพิเศษ Flash Sale"
      >
        <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">⚡ Flash Sale</p>
        <h3 className="mt-1 text-xl font-black leading-snug">
          สินค้าราคาพิเศษ
          <br />
          ดีลแรง เครื่องมือช่างคุณภาพ
        </h3>
        <div className="mt-3">
          <SaleCountdown endsAt={flashEndsAt} />
        </div>
        <Link
          href="/products?status=สินค้าลดราคา"
          className="mt-4 block rounded-xl bg-white px-4 py-2.5 text-center text-sm font-black text-emerald-900 transition hover:bg-emerald-50"
        >
          ดูสินค้าทั้งหมด →
        </Link>
      </aside>
    </div>
  );
}
