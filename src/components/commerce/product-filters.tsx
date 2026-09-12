'use client';

import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { subcategoriesForKey } from '@/shared/categories';

export type FilterCategory = { key: string; name: string; icon?: string; product_count?: number | null };
export type FilterBrand = { id: string; name: string };

const PRICE_CEILING = 50000;

type Props = {
  q: string;
  category: string;
  brand: string;
  status: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
  categories: FilterCategory[];
  brands: FilterBrand[];
  facetCounts: Record<string, number>;
};

function toQuery(next: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v !== '' && v !== 'default') params.set(k, v);
  }
  const s = params.toString();
  return `/products${s ? `?${s}` : ''}`;
}

export function ProductFilters(props: Props) {
  const router = useRouter();
  const [q, setQ] = useState(props.q);
  const [category, setCategory] = useState(props.category);
  const [brand, setBrand] = useState(props.brand);
  const [status, setStatus] = useState(props.status);
  const [sort, setSort] = useState(props.sort || 'default');
  const [minPrice, setMinPrice] = useState(props.minPrice);
  const [maxPrice, setMaxPrice] = useState(props.maxPrice);
  const [open, setOpen] = useState(true);
  const [groups, setGroups] = useState({ category: true, brand: true, price: true, status: true });
  const toggle = (k: keyof typeof groups) => setGroups((g) => ({ ...g, [k]: !g[k] }));

  const current = { q, category, brand, status, sort, min_price: minPrice, max_price: maxPrice };
  const apply = (next: Partial<typeof current> = {}) => router.push(toQuery({ ...current, ...next }));
  const dirty =
    q !== props.q ||
    category !== props.category ||
    brand !== props.brand ||
    status !== props.status ||
    sort !== (props.sort || 'default') ||
    minPrice !== props.minPrice ||
    maxPrice !== props.maxPrice;

  const sliderValue = Number(maxPrice) || PRICE_CEILING;

  const body = (
    <div className="space-y-5">
      <search aria-label="ค้นหาในหน้าสินค้า">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          className="flex gap-2"
        >
          <label className="sr-only" htmlFor="catalog-q">
            ค้นหาสินค้า
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="catalog-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า…"
              className="pl-9"
            />
          </div>
          <Button type="submit" size="sm" className="h-11 shrink-0">
            ค้นหา
          </Button>
        </form>
      </search>

      <section>
        <button
          type="button"
          onClick={() => toggle('category')}
          aria-expanded={groups.category}
          className="flex w-full items-center justify-between py-1 text-left font-bold"
        >
          หมวดหมู่สินค้า
          <span aria-hidden="true" className={`transition ${groups.category ? '' : '-rotate-90'}`}>
            ▾
          </span>
        </button>
        {groups.category && (
          <div className="mt-2 grid gap-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setCategory('');
                apply({ category: '' });
              }}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 ${!category ? 'font-bold text-emerald-800' : ''}`}
            >
              ทั้งหมด
            </button>
            {props.categories.map((c) => {
              const count = props.facetCounts[c.name] ?? c.product_count ?? null;
              const subs = subcategoriesForKey(c.key);
              const active = category === c.key;
              const pickSub = (query: string) => {
                setQ(query);
                apply({ q: query });
              };
              return (
                <div key={c.key} className="group/cat relative">
                  <button
                    type="button"
                    onClick={() => {
                      const next = active ? '' : c.key;
                      setCategory(next);
                      apply({ category: next });
                    }}
                    aria-current={active}
                    aria-expanded={subs.length > 0 ? active : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 ${active ? 'bg-emerald-50 font-bold text-emerald-800' : ''}`}
                  >
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{count ?? '›'}</span>
                  </button>
                  {/* มือถือ/ทัช: กางหมวดย่อยด้านล่างเมื่อแตะเลือก — เดสก์ท็อปใช้ flyout ด้านขวาแทน */}
                  {active && subs.length > 0 && (
                    <div className="ml-3 flex flex-wrap gap-x-3 gap-y-1 border-l border-emerald-100 py-1.5 pl-3 lg:hidden">
                      {subs.map((s) => (
                        <button
                          key={s.query}
                          type="button"
                          onClick={() => pickSub(s.query)}
                          className="text-xs text-slate-500 hover:text-emerald-800 hover:underline"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* เดสก์ท็อป: hover แล้วแผงหมวดย่อยกางออกด้านขวาแบบ bar (mega menu) */}
                  {subs.length > 0 && (
                    <div className="invisible absolute left-full top-0 z-30 ml-2 hidden w-60 opacity-0 transition-all duration-150 group-hover/cat:visible group-hover/cat:opacity-100 group-focus-within/cat:visible group-focus-within/cat:opacity-100 lg:block">
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <p className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-sm font-black text-emerald-950">
                          {c.name}
                        </p>
                        <div className="grid gap-0.5 p-2">
                          {subs.map((s) => (
                            <button
                              key={s.query}
                              type="button"
                              onClick={() => pickSub(s.query)}
                              className="truncate rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800"
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => toggle('brand')}
          aria-expanded={groups.brand}
          className="flex w-full items-center justify-between py-1 text-left font-bold"
        >
          แบรนด์
          <span aria-hidden="true" className={`transition ${groups.brand ? '' : '-rotate-90'}`}>
            ▾
          </span>
        </button>
        {groups.brand && (
          <div className="mt-2">
            <label className="sr-only" htmlFor="catalog-brand">
              แบรนด์
            </label>
            <Select
              id="catalog-brand"
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                apply({ brand: e.target.value });
              }}
            >
              <option value="">ทุกแบรนด์</option>
              {props.brands.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => toggle('price')}
          aria-expanded={groups.price}
          className="flex w-full items-center justify-between py-1 text-left font-bold"
        >
          ช่วงราคา (บาท)
          <span aria-hidden="true" className={`transition ${groups.price ? '' : '-rotate-90'}`}>
            ▾
          </span>
        </button>
        {groups.price && (
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="catalog-min">
                  ราคาต่ำสุด
                </label>
                <Input
                  id="catalog-min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="ขั้นต่ำ"
                />
              </div>
              <span aria-hidden="true" className="text-slate-400">
                –
              </span>
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="catalog-max">
                  ราคาสูงสุด
                </label>
                <Input
                  id="catalog-max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="สูงสุด"
                />
              </div>
            </div>
            <div>
              <label className="sr-only" htmlFor="catalog-ceiling">
                เพดานราคาสูงสุด
              </label>
              <input
                id="catalog-ceiling"
                type="range"
                min={0}
                max={PRICE_CEILING}
                step={100}
                value={Math.min(PRICE_CEILING, sliderValue)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxPrice(v >= PRICE_CEILING ? '' : String(v));
                }}
                className="w-full accent-emerald-800"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>0</span>
                <span>{maxPrice ? `≤ ${Number(maxPrice).toLocaleString('th-TH')} ฿` : 'ไม่จำกัด'}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() => toggle('status')}
          aria-expanded={groups.status}
          className="flex w-full items-center justify-between py-1 text-left font-bold"
        >
          สถานะ
          <span aria-hidden="true" className={`transition ${groups.status ? '' : '-rotate-90'}`}>
            ▾
          </span>
        </button>
        {groups.status && (
          <div className="mt-2">
            <label className="sr-only" htmlFor="catalog-status">
              สถานะสินค้า
            </label>
            <Select
              id="catalog-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                apply({ status: e.target.value });
              }}
            >
              <option value="">ทั้งหมด</option>
              <option value="สินค้าลดราคา">สินค้าลดราคา</option>
              <option value="สินค้าใหม่">สินค้าใหม่</option>
            </Select>
          </div>
        )}
      </section>

      <div className="grid gap-2">
        <Button type="button" disabled={!dirty} onClick={() => apply()}>
          กรองสินค้า
        </Button>
        <Link href="/products" className={cn(buttonVariants({ variant: 'outline' }))}>
          ล้างตัวกรอง
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <details className="rounded-2xl border bg-white p-4 lg:hidden">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold">
          <SlidersHorizontal className="size-4" />
          กรองสินค้า
        </summary>
        <div className="mt-4">{body}</div>
      </details>
      <aside className="hidden lg:block" aria-label="ตัวกรองสินค้า">
        {body}
      </aside>
    </>
  );
}

export function SortSelect({ value, keep }: { value: string; keep: Record<string, string> }) {
  const router = useRouter();
  const onChange = (v: string) => {
    const params = new URLSearchParams();
    for (const [k, val] of Object.entries(keep)) if (val) params.set(k, val);
    if (v && v !== 'default') params.set('sort', v);
    const s = params.toString();
    router.push(`/products${s ? `?${s}` : ''}`);
  };
  return (
    <Field label="เรียงลำดับ" className="w-44">
      <Select value={value || 'default'} onChange={(e) => onChange(e.target.value)} aria-label="เรียงลำดับสินค้า">
        <option value="default">ล่าสุด</option>
        <option value="price-asc">ราคา: น้อยไปมาก</option>
        <option value="price-desc">ราคา: มากไปน้อย</option>
        <option value="name-asc">ชื่อ: ก-ฮ</option>
      </Select>
    </Field>
  );
}

export function ClearFilters() {
  return (
    <Link href="/products" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
      <RotateCcw className="size-3.5" />
      ล้างตัวกรอง
    </Link>
  );
}
