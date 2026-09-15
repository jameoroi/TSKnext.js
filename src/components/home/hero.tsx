'use client';

import Link from 'next/link';
import { BannerCarousel } from '@/components/content/banner-carousel';

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

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6" aria-label="แบนเนอร์โปรโมชั่น">
      <BannerCarousel
        slides={items.map((item) => ({ src: item.src, href: item.link, alt: item.alt }))}
        className="aspect-[12/5] rounded-3xl shadow-2xl"
        label="แบนเนอร์โปรโมชั่น"
      />
    </section>
  );
}
