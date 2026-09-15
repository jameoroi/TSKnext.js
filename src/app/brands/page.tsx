import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero } from '@/components/content/page-hero';
import { BrandLogo } from '@/components/home/brand-logo';
import { Input } from '@/components/ui/input';
import { getBrands } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'แบรนด์สินค้า',
  description: 'รวมแบรนด์เครื่องมือช่าง ปั๊มน้ำ และอุปกรณ์การเกษตรที่ THAISERKIT SUPPLY จัดจำหน่าย',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = String(raw || '')
    .trim()
    .toLowerCase();
  let all: Array<Record<string, unknown>> = [];
  try {
    const result = await getBrands();
    all = Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('[brands] public brand list unavailable', error instanceof Error ? error.message : error);
  }
  const brands = (Array.isArray(all) ? all : []).filter(
    (b: Record<string, unknown>) =>
      !q ||
      String(b.name || '')
        .toLowerCase()
        .includes(q),
  );

  return (
    <>
      <PageHero title="แบรนด์สินค้า" subtitle="เลือกดูสินค้าแยกตามแบรนด์ที่เราจำหน่าย" />
      <div className="mx-auto max-w-7xl px-4 py-10">
        <search aria-label="ค้นหาแบรนด์">
          <form method="get" action="/brands" className="mx-auto flex max-w-md gap-2">
            <label className="sr-only" htmlFor="brand-q">
              ค้นหาแบรนด์
            </label>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input id="brand-q" name="q" defaultValue={q} placeholder="ค้นหาชื่อแบรนด์…" className="pl-9" />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-emerald-950 px-5 text-sm font-bold text-white"
            >
              ค้นหา
            </button>
          </form>
        </search>
        <p className="mt-4 text-center text-sm text-slate-500">
          {q ? (
            <>
              พบ {brands.length.toLocaleString('th-TH')} แบรนด์ที่ตรงกับ “{q}” ·{' '}
              <Link href="/brands" className="font-bold text-emerald-800 hover:underline">
                ล้างการค้นหา
              </Link>
            </>
          ) : (
            <>ทั้งหมด {brands.length.toLocaleString('th-TH')} แบรนด์</>
          )}
        </p>

        {brands.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {brands.map((b: Record<string, unknown>) => {
              const name = String(b.name || '');
              const src = String(b.logo_url || b.logo_data_url || b.img || '');
              const key = String(b.id || name);
              return (
                <Link
                  key={key}
                  href={`/products?brand=${encodeURIComponent(String(b.id || name))}`}
                  className="grid min-h-24 place-items-center p-2 text-center transition hover:opacity-80"
                  aria-label={name}
                >
                  <span className="grid h-14 w-full place-items-center px-2 text-center">
                    <BrandLogo src={src} name={name} className="max-h-14 max-w-full object-contain" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-dashed bg-white p-10 text-center">
            <h2 className="font-bold">ไม่พบแบรนด์ที่ค้นหา</h2>
            <p className="mt-1 text-sm text-slate-500">ลองคำอื่น หรือดูสินค้าทั้งหมดได้เลย</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/brands" className="rounded-xl border px-4 py-2 text-sm font-bold">
                ล้างการค้นหา
              </Link>
              <Link
                href="/products"
                className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white"
              >
                ดูสินค้าทั้งหมด
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
