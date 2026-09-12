'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Banner = { src: string; link: string; alt: string };

function pick(row: Record<string, unknown>): Banner | null {
  if (row?.active === false) return null;
  const src = String(row?.img || row?.image_url || row?.image || '');
  if (!src) return null;
  return {
    src,
    link: String(row?.link || row?.link_url || '/products'),
    alt: String(row?.alt || 'โปรโมชั่น THAISERKIT SUPPLY'),
  };
}

/**
 * HERO — carousel ล้วนเต็มแถบ (ไม่มีคอลัมน์ข้อความ ข้อความอยู่ในรูปแบนเนอร์เอง)
 * slides มาจาก CMS (site.banners → อนาคต Supabase: banners) รองรับ 4 สไลด์ขึ้นไป
 * ใหญ่สุดของหน้าแรก: เล่นอัตโนมัติ 6 วิ + ลูกศรซ้ายขวา + dots, หยุดเมื่อ hover/focus
 */
export function Hero({ banners }: { banners: Array<Record<string, unknown>> }) {
  const slides = banners.map(pick).filter((b): b is Banner => b !== null);
  const items = slides.length
    ? slides
    : [{ src: '/legacy-assets/banners/1.png', link: '/products', alt: 'โปรโมชั่น THAISERKIT SUPPLY' }];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (count < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [count, paused]);

  return (
    <section
      className="mx-auto max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6"
      aria-label="แบนเนอร์โปรโมชั่น"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative">
        <div className="relative block aspect-[16/10] overflow-hidden rounded-3xl shadow-2xl sm:aspect-[16/8] lg:aspect-[16/6]">
          {items.map((item, i) => (
            <Link
              key={`${item.src}|${item.link}`}
              href={item.link}
              aria-hidden={i !== index}
              tabIndex={i !== index ? -1 : undefined}
              className={`hero-slide absolute inset-0 transition-opacity duration-500 ${i === index ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                priority={i === 0}
                className="object-cover"
                unoptimized={item.src.startsWith('data:')}
              />
            </Link>
          ))}
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="แบนเนอร์ก่อนหน้า"
              className="absolute left-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:size-12"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="แบนเนอร์ถัดไป"
              className="absolute right-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 sm:size-12"
            >
              <ChevronRight size={22} />
            </button>
            <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-2">
              {items.map((item, i) => (
                <button
                  key={`${item.src}|${item.link}|dot`}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`ไปสไลด์ที่ ${i + 1}`}
                  aria-current={i === index}
                  className={`h-2 rounded-full transition-all ${i === index ? 'w-7 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
