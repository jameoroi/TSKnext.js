import Link from 'next/link';
import { BannerCarousel } from '@/components/content/banner-carousel';

type Banner = Record<string, unknown>;

function imageOf(row: Banner) {
  return String(row.img || row.image_url || row.image || '').trim();
}
function labelOf(row: Banner) {
  return String(row.alt_text || row.title || row.name || 'โปรโมชัน');
}
function hrefOf(row: Banner) {
  return String(row.link_url || row.url || '').trim();
}

export function PromoRail({
  banners,
  variant = 'panel',
}: {
  banners: Banner[];
  variant?: 'panel' | 'campaign';
}) {
  const rows = banners.filter((row) => row && row.active !== false && imageOf(row));
  if (!rows.length) return null;
  const campaign = variant === 'campaign';
  if (campaign) {
    // A plain banner (no hover pop), several pictures sliding to the right.
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-6" aria-label="แบนเนอร์แคมเปญ">
        <BannerCarousel
          slides={rows.map((row) => ({ src: imageOf(row), href: hrefOf(row), alt: labelOf(row) }))}
          className="aspect-[6/1] w-full rounded-2xl"
          label="แบนเนอร์แคมเปญ"
        />
      </section>
    );
  }
  return (
    <section
      className={`mx-auto max-w-7xl px-4 lg:px-6 ${campaign ? 'py-8' : 'py-5'}`}
      aria-label={campaign ? 'แบนเนอร์แคมเปญ' : 'โปรโมชัน'}
    >
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {rows.map((row, index) => (
          <BannerItem key={String(row.id || `${imageOf(row)}-${index}`)} row={row} campaign={campaign} />
        ))}
      </div>
    </section>
  );
}

function BannerItem({ row, campaign }: { row: Banner; campaign: boolean }) {
  const image = imageOf(row);
  const label = labelOf(row);
  const href = hrefOf(row);
  const body = (
    <span
      className={`block overflow-hidden rounded-2xl ${campaign ? 'aspect-[6/1] w-full min-w-full' : 'aspect-[16/7] min-w-[78%] border bg-white shadow-sm sm:min-w-[48%] lg:min-w-[32%]'}`}
    >
      {/* The legacy admin stores arbitrary CDN/data URLs. Plain img preserves that contract without widening next/image remotePatterns. */}
      {/* biome-ignore lint/a11y/useAltText: alt is supplied explicitly below */}
      <img src={image} alt={label} loading="lazy" decoding="async" className="h-full w-full object-cover" />
    </span>
  );
  if (!href) return <div className="contents">{body}</div>;
  if (href.startsWith('/'))
    return (
      <Link href={href} className="contents">
        {body}
      </Link>
    );
  return (
    <a href={href} target="_blank" rel="noreferrer" className="contents">
      {body}
    </a>
  );
}
