'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AutoRail } from './auto-rail';
import { PromoBannerPlaceholder } from './placeholders';

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
 * PROMOTION_BANNERS — DYNAMIC_DATA, 3 ช่อง
 * data_source_future: Supabase: banners
 * ช่องไหนยังไม่มีแบนเนอร์จากหลังบ้าน แสดง PROMO_BANNER_n placeholder แทน
 */
export function PromoBanners({ banners }: { banners: Banner[] }) {
  const live = banners.filter((row) => row && row.active !== false && imageOf(row)).slice(0, 3);
  const slots: Array<{ row: Banner | null; slot: number }> = [1, 2, 3].map((slot) => ({
    row: live[slot - 1] || null,
    slot,
  }));
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 lg:px-6" aria-label="แบนเนอร์โปรโมชั่น">
      <AutoRail label="แบนเนอร์โปรโมชั่น" itemClassName="min-w-[82%] snap-start sm:min-w-[47%] lg:min-w-[32%]">
        {slots.map(({ row, slot }) => (
          <div key={String(row?.id || `promo-slot-${slot}`)}>
            {row ? <PromoBannerItem row={row} /> : <PromoBannerPlaceholder slot={slot} />}
          </div>
        ))}
      </AutoRail>
    </section>
  );
}

function PromoBannerItem({ row }: { row: Banner }) {
  const image = imageOf(row);
  const label = labelOf(row);
  const href = hrefOf(row);
  const [failed, setFailed] = useState(false);
  const body = (
    <span className="block aspect-[16/8] overflow-hidden rounded-3xl border bg-white shadow-sm">
      {failed ? (
        <span className="grid h-full place-items-center bg-emerald-950 px-4 text-center text-xs font-bold text-white">
          แบนเนอร์โหลดไม่สำเร็จ กรุณาเปลี่ยนรูปจากหลังบ้าน
        </span>
      ) : (
        // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
        <img
          src={image}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
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
