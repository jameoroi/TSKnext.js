'use client';

import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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

const PILLS = ['สินค้าของแท้ 100%', 'จัดส่งทั่วไทย 1–3 วัน', 'รับประกันสินค้า', 'บริการหลังการขาย'];

/**
 * HERO — สไลด์รูปภาพเต็มแถบ (รูปจาก CMS: admin/เนื้อหา → สไลด์ใหญ่)
 * ข้อความ static ทับบนรูป + ลูกศร + dots + เล่นออโต้
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
      <div className="relative aspect-[16/12] sm:aspect-[16/8] lg:aspect-[16/6]">
        {items.map((item, i) => (
          <div
            key={`${item.src}|${item.link}`}
            aria-hidden={i !== index}
            className={`absolute inset-0 transition-opacity duration-500 ${i === index ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
          >
            <Image
              src={item.src}
              alt={item.alt}
              fill
              priority={i === 0}
              className="object-cover"
              unoptimized={item.src.startsWith('data:')}
            />
          </div>
        ))}
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-emerald-950/90 via-emerald-950/45 to-transparent" />
        <div className="absolute inset-0 z-20 mx-auto grid max-w-7xl items-center gap-6 px-4 lg:grid-cols-[1.2fr_.8fr] lg:px-6">
          <div className="text-white">
            <h1 className="text-3xl font-black leading-tight sm:text-5xl">
              เครื่องมือช่าง
              <br />
              ตัวจริงของมืออาชีพ
            </h1>
            <p className="mt-2 text-sm font-bold text-emerald-50/85 sm:text-base">ครบ ครบคุ้มภาพ พร้อมส่งทั่วไทย</p>
            <ul className="mt-4 flex max-w-lg flex-wrap gap-2 text-xs font-bold">
              {PILLS.map((pill) => (
                <li
                  key={pill}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-white backdrop-blur"
                >
                  <span aria-hidden="true" className="text-amber-300">
                    ✓
                  </span>
                  {pill}
                </li>
              ))}
            </ul>
            <Link
              href={items[index]?.link || '/products'}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-7 py-3 text-base font-black text-white shadow-lg transition hover:bg-emerald-400"
            >
              เลือกที่ชอบ <ArrowRight size={19} />
            </Link>
          </div>
          <div className="hidden text-right text-white lg:block">
            <p className="text-sm font-black tracking-[.2em] text-white/80">TOOLS FOR A BETTER TOMORROW</p>
            <p className="mt-2 text-lg font-bold leading-8">เครื่องมือที่ดี สร้างอนาคตที่ดีกว่า</p>
          </div>
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="แบนเนอร์ก่อนหน้า"
              className="absolute left-3 top-1/2 z-30 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="แบนเนอร์ถัดไป"
              className="absolute right-3 top-1/2 z-30 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
            >
              <ChevronRight size={20} />
            </button>
            <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-2">
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
