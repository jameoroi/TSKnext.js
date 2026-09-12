'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';

type Row = Record<string, unknown>;

export function CategoryRail({ categories }: { categories: Row[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (direction: -1 | 1) =>
    ref.current?.scrollBy({
      left: direction * Math.max(260, (ref.current?.clientWidth || 600) * 0.75),
      behavior: 'smooth',
    });
  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((category) => {
          const key = String(category.key || category.id || category.name || '');
          const src = String(category.image || category.image_url || category.img || '');
          const en = String(category.en || '');
          return (
            <Link
              key={key}
              href={`/products?category=${encodeURIComponent(key)}`}
              className="cat-card reveal group min-w-[42%] snap-start rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:min-w-[27%] md:min-w-[19%] lg:min-w-[14.5%]"
            >
              {src ? (
                <div className="relative mx-auto mb-3 aspect-square max-w-24">
                  <Image
                    src={src}
                    alt={String(category.name || key)}
                    fill
                    className="object-contain"
                    unoptimized={src.startsWith('data:')}
                  />
                </div>
              ) : (
                <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-emerald-50 text-2xl">
                  🛠️
                </div>
              )}
              {en ? (
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">{en}</p>
              ) : null}
              <strong className="line-clamp-2 text-sm">{String(category.name || key)}</strong>
            </Link>
          );
        })}
      </div>
      {categories.length > 6 ? (
        <>
          <button
            type="button"
            onClick={() => move(-1)}
            className="absolute left-1 top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border bg-white shadow md:grid"
            aria-label="หมวดหมู่ก่อนหน้า"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className="absolute right-1 top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border bg-white shadow md:grid"
            aria-label="หมวดหมู่ถัดไป"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}
