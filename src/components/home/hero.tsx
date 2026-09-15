'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export function Hero({ banners }: { banners: Array<Record<string, unknown>> }) {
  const slides = banners.map(pick).filter((b): b is Banner => b !== null);
  const items = slides;
  const [index, setIndex] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState<string[]>([]);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  if (!items.length) {
    return (
      <section className="mx-auto max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6" aria-label="แบนเนอร์โปรโมชั่น">
        <div className="grid min-h-[220px] place-items-center overflow-hidden rounded-3xl border border-dashed border-emerald-300 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 px-6 py-12 text-center text-white shadow-2xl sm:min-h-[300px] lg:min-h-[390px]">
          <div className="max-w-xl">
            <p className="text-xs font-black uppercase tracking-[.24em] text-emerald-200">HOMEPAGE SLIDER</p>
            <h1 className="mt-3 text-2xl font-black sm:text-4xl">อัปโหลดแบนเนอร์หน้าแรกจากหลังบ้าน</h1>
            <p className="mt-3 text-sm leading-6 text-emerald-50/75">
              Carousel จะแสดงรูปที่ผู้ดูแลอัปโหลดในเมนูจัดการคอนเทนต์เท่านั้น
            </p>
            <Link
              href="/admin/content"
              className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-black text-emerald-950 transition hover:bg-emerald-50"
            >
              ไปจัดการสไลด์
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const current = items[index % items.length];
  const currentFailed = failedSrcs.includes(current.src);
  // A banner that fails to load moves the carousel on; the notice only shows
  // once every slide has failed, so one bad upload never blanks the hero.
  const allFailed = items.every((item) => failedSrcs.includes(item.src));
  const markFailed = (src: string) => {
    setFailedSrcs((list) => (list.includes(src) ? list : [...list, src]));
    const next = items.findIndex(
      (item, i) => i !== index % items.length && !failedSrcs.includes(item.src) && item.src !== src,
    );
    if (next >= 0) setIndex(next);
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6" aria-label="แบนเนอร์โปรโมชั่น">
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl shadow-2xl sm:aspect-[16/8] lg:aspect-[16/6]">
        {allFailed || currentFailed ? (
          <div className="absolute inset-0 grid place-items-center bg-emerald-950 px-6 text-center text-white">
            <div>
              <p className="text-sm font-bold">แบนเนอร์นี้โหลดไม่สำเร็จ</p>
              <p className="mt-1 text-xs text-emerald-100/70">กรุณาเปลี่ยนรูปจากเมนูจัดการคอนเทนต์</p>
            </div>
          </div>
        ) : (
          <Link href={current.link} aria-label={current.alt} className="absolute inset-0">
            <Image
              src={current.src}
              alt={current.alt}
              fill
              priority
              className="object-cover"
              unoptimized={current.src.startsWith('data:')}
              onError={() => markFailed(current.src)}
            />
          </Link>
        )}
        {items.length > 1 && (
          <>
            <button
              type="button"
              aria-label="แบนเนอร์ก่อนหน้า"
              onClick={() => setIndex((index - 1 + items.length) % items.length)}
              className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow transition hover:bg-white"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="แบนเนอร์ถัดไป"
              onClick={() => setIndex((index + 1) % items.length)}
              className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow transition hover:bg-white"
            >
              <ChevronRight size={20} />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {items.map((item, itemIndex) => (
                <button
                  key={`${item.src}-${itemIndex}`}
                  type="button"
                  aria-label={`ไปสไลด์ที่ ${itemIndex + 1}`}
                  onClick={() => setIndex(itemIndex)}
                  className={`h-2 rounded-full transition-all ${itemIndex === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
