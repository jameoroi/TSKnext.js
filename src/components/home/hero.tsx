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
  const items = slides.length ? slides : [{ src: '/legacy-assets/banners/1.png', link: '/products', alt: 'โปรโมชั่น THAISERKIT SUPPLY' }];
  const [index, setIndex] = useState(0);
  const current = items[index % items.length];

  useEffect(() => {
    if (items.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), 5000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  return (
    <section
      className="mx-auto max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6"
      aria-label="แบนเนอร์โปรโมชั่น"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl shadow-2xl sm:aspect-[16/8] lg:aspect-[16/6]">
        <Link href={current.link} aria-label={current.alt} className="absolute inset-0">
          <Image src={current.src} alt={current.alt} fill priority className="object-cover" unoptimized={current.src.startsWith('data:')} />
        </Link>
        {items.length > 1 && <>
          <button type="button" aria-label="แบนเนอร์ก่อนหน้า" onClick={() => setIndex((index - 1 + items.length) % items.length)} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow transition hover:bg-white">
            <ChevronLeft size={20} />
          </button>
          <button type="button" aria-label="แบนเนอร์ถัดไป" onClick={() => setIndex((index + 1) % items.length)} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-900 shadow transition hover:bg-white">
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {items.map((item, itemIndex) => <button key={`${item.src}-${itemIndex}`} type="button" aria-label={`ไปสไลด์ที่ ${itemIndex + 1}`} onClick={() => setIndex(itemIndex)} className={`h-2 rounded-full transition-all ${itemIndex === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`} />)}
          </div>
        </>}
      </div>
    </section>
  );
}
