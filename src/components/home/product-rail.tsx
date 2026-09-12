'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProductCard } from '@/components/commerce/product-card';
import type { Product } from '@/features/catalog/types';

export function ProductRail({
  products,
  auto = false,
  dark = false,
  badge,
}: {
  products: Product[];
  auto?: boolean;
  dark?: boolean;
  badge?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  function move(direction: -1 | 1) {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(280, node.clientWidth * 0.82), behavior: 'smooth' });
  }

  // เลื่อนอัตโนมัติแบบนุ่มต่อเนื่อง (rAF drift + วนซ้ำไร้รอยต่อด้วยเนื้อหาซ้ำ 2 ชุด)
  useEffect(() => {
    if (
      !auto ||
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    let raf = 0;
    let last = performance.now();
    const SPEED = 36;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const node = ref.current;
      if (!node || pausedRef.current || node.children.length < 2) {
        last = now;
        return;
      }
      const dt = Math.min(64, now - last);
      last = now;
      node.scrollLeft += (SPEED * dt) / 1000;
      const half = node.scrollWidth / 2;
      if (half > 0 && node.scrollLeft >= half) node.scrollLeft -= half;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  if (!products.length) return null;
  const loop =
    auto && products.length > 1
      ? [...products.map((p) => ({ p, copy: false })), ...products.map((p) => ({ p: p, copy: true }))]
      : products.map((p) => ({ p, copy: false }));
  const touchPause = () => setPaused(true);
  const touchResume = () => window.setTimeout(() => setPaused(false), 2500);
  return (
    <section
      className="relative"
      aria-label="รายการสินค้า"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={touchPause}
      onPointerUp={touchResume}
      onPointerCancel={touchResume}
    >
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loop.map(({ p: product, copy }) => (
          <div
            key={copy ? `${product.id}-copy` : product.id}
            aria-hidden={copy || undefined}
            className="min-w-[72%] snap-start sm:min-w-[42%] md:min-w-[31%] lg:min-w-[24%] xl:min-w-[19%]"
          >
            <ProductCard product={product} badge={badge} />
          </div>
        ))}
      </div>
      {products.length > 4 ? (
        <>
          <button
            type="button"
            onClick={() => move(-1)}
            className={`absolute left-1 top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border shadow-lg md:grid ${dark ? 'border-white/20 bg-slate-950/85 text-white' : 'bg-white text-slate-900'}`}
            aria-label="สินค้าก่อนหน้า"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className={`absolute right-1 top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border shadow-lg md:grid ${dark ? 'border-white/20 bg-slate-950/85 text-white' : 'bg-white text-slate-900'}`}
            aria-label="สินค้าถัดไป"
          >
            <ChevronRight />
          </button>
        </>
      ) : null}
    </section>
  );
}
