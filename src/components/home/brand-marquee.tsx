'use client';

import Image from 'next/image';
import Link from 'next/link';

export type BrandRow = { id: string; name: string; logo: string };

/** แถวโลโก้แบรนด์เลื่อนอัตโนมัติแบบไร้รอยต่อ (CSS animation + เนื้อหาซ้ำ 2 ชุด) */
export function BrandMarquee({ brands, speed = 32 }: { brands: BrandRow[]; speed?: number }) {
  if (!brands.length) return null;
  const loop = [...brands, ...brands];
  return (
    <div
      className="marquee group relative overflow-hidden"
      role="region"
      aria-label="แบรนด์ชั้นนำ"
      style={{ ['--marquee-speed' as string]: `${speed}s` }}
    >
      <div className="marquee-track flex w-max items-stretch gap-3">
        {loop.map((b, i) => (
          <Link
            key={`${b.id}-${i}`}
            href={`/products?brand=${encodeURIComponent(b.id || b.name)}`}
            aria-hidden={i >= brands.length}
            tabIndex={i >= brands.length ? -1 : undefined}
            className="grid min-h-24 w-36 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:w-44"
          >
            {b.logo ? (
              <span className="relative block h-12 w-full">
                <strong className="absolute inset-0 grid place-items-center px-2 text-center text-sm leading-5">
                  {b.name}
                </strong>
                <Image
                  src={b.logo}
                  alt=""
                  fill
                  loading="lazy"
                  className="bg-white object-contain"
                  unoptimized={b.logo.startsWith('data:')}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </span>
            ) : (
              <span className="text-sm font-bold">{b.name}</span>
            )}
          </Link>
        ))}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#f7f8f6] to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f7f8f6] to-transparent" />
    </div>
  );
}
