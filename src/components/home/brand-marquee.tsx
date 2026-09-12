'use client';

import Image from 'next/image';
import Link from 'next/link';

export type BrandRow = { id: string; name: string; logo: string };

/** แถวโลโก้แบรนด์เลื่อนอัตโนมัติแบบไร้รอยต่อ (CSS animation + เนื้อหาซ้ำ 2 ชุด) */
export function BrandMarquee({ brands, speed = 32 }: { brands: BrandRow[]; speed?: number }) {
  if (!brands.length) return null;
  const loop = [
    ...brands.map((b) => ({ brand: b, copy: false })),
    ...brands.map((b) => ({ brand: b, copy: true })),
  ];
  return (
    <section
      className="marquee group relative overflow-hidden"
      aria-label="แบรนด์ชั้นนำ"
      style={{ ['--marquee-speed' as string]: `${speed}s` }}
    >
      <div className="marquee-track flex w-max items-stretch gap-3">
        {loop.map(({ brand: b, copy }) => (
          <Link
            key={copy ? `${b.id}-loop` : b.id}
            href={`/products?brand=${encodeURIComponent(b.id || b.name)}`}
            aria-hidden={copy || undefined}
            tabIndex={copy ? -1 : undefined}
            className="grid h-16 w-36 shrink-0 place-items-center p-2 transition hover:opacity-80 sm:w-44"
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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#f7f8f6] to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f7f8f6] to-transparent"
      />
    </section>
  );
}
