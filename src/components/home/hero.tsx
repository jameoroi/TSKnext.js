'use client';

import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, RotateCcw, Truck } from 'lucide-react';
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

const TRUST = [
  { Icon: BadgeCheck, label: 'สินค้าแท้ 100% มั่นใจได้' },
  { Icon: Truck, label: 'จัดส่งทั่วไทย 1–3 วัน' },
  { Icon: RotateCcw, label: 'คืนสินค้าใน 7 วัน' },
] as const;

/**
 * HERO — แถบมืดเต็มจอ: ข้อความซ้าย + carousel ขวา (เลื่อนออโต้ + ลูกศร + dots)
 * สไลด์มาจาก CMS (site.banners → อนาคต Supabase: banners)
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
      className="relative overflow-hidden bg-emerald-950"
      aria-label="แบนเนอร์โปรโมชั่น"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 lg:grid-cols-[.85fr_1.15fr] lg:px-6 lg:py-14">
        <div className="relative z-10 text-white">
          <h1 className="text-3xl font-black leading-tight sm:text-5xl lg:text-[3.2rem] lg:leading-[1.15]">
            เครื่องมือช่าง
            <br />
            และอุปกรณ์อุตสาหกรรม
            <br />
            <span className="text-amber-300">ครบ จบที่เดียว</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-emerald-50/80 sm:text-base sm:leading-7">
            สินค้าคุณภาพ จากแบรนด์ชั้นนำ ตอบโจทย์ทุกงานช่าง งานอุตสาหกรรม และงานก่อสร้าง
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-emerald-50 sm:text-sm">
            {TRUST.map(({ Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-1.5">
                <Icon size={17} className="text-amber-300" /> {label}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-8 py-3.5 text-base font-black text-emerald-950 shadow-lg transition hover:bg-amber-300"
            >
              ช้อปเลย <ArrowRight size={19} />
            </Link>
          </div>
        </div>
        <div className="relative">
          <div className="relative block aspect-[16/9] overflow-hidden rounded-3xl shadow-2xl">
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
                className="absolute left-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="แบนเนอร์ถัดไป"
                className="absolute right-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
              >
                <ChevronRight size={20} />
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
      </div>
    </section>
  );
}
