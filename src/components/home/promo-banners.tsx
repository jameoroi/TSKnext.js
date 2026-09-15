'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AutoRail } from './auto-rail';

type Banner = Record<string, unknown>;

function imageOf(row: Banner) {
  return String(row.img || row.image_url || row.image || '').trim();
}
function labelOf(row: Banner) {
  return String(row.alt_text || row.title || row.name || 'โปรโมชั่น');
}
function hrefOf(row: Banner) {
  return String(row.link_url || row.link || row.url || '').trim();
}

/**
 * PROMOTION_BANNERS — แถวแบนเนอร์ใต้ Hero
 *
 * Only pictures that exist are shown. Empty slots used to render a white
 * placeholder card, and a picture that failed to load (a file missing from the
 * bucket) left an empty frame the row kept scrolling past — shoppers saw white
 * boxes and a gap. A failed picture is now dropped from the row, and when none
 * are left the whole row is hidden. The admin banner editor still lists them.
 */
export function PromoBanners({ banners }: { banners: Banner[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const live = banners
    .filter((row) => row && row.active !== false && imageOf(row))
    .filter((row) => !failed.includes(imageOf(row)))
    .slice(0, 12);
  if (!live.length) return null;
  const markFailed = (src: string) => setFailed((list) => (list.includes(src) ? list : [...list, src]));
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 lg:px-6" aria-label="แบนเนอร์โปรโมชั่น">
      <AutoRail label="แบนเนอร์โปรโมชั่น" itemClassName="min-w-[82%] snap-start sm:min-w-[47%] lg:min-w-[32%]">
        {live.map((row, index) => (
          <PromoBannerItem key={String(row.id || `${imageOf(row)}-${index}`)} row={row} onFail={markFailed} />
        ))}
      </AutoRail>
    </section>
  );
}

function PromoBannerItem({ row, onFail }: { row: Banner; onFail: (src: string) => void }) {
  const image = imageOf(row);
  const label = labelOf(row);
  const href = hrefOf(row);
  const body = (
    <span className="tsk-pop block aspect-[12/5] overflow-hidden rounded-3xl border bg-white shadow-sm">
      {/* biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs */}
      <img
        src={image}
        alt={label}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
        onError={() => onFail(image)}
      />
    </span>
  );
  if (!href) return body;
  if (href.startsWith('/'))
    return (
      <Link href={href} aria-label={label}>
        {body}
      </Link>
    );
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {body}
    </a>
  );
}
