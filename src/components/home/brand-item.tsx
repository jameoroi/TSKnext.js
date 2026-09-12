import Link from 'next/link';
import type { HomeBrand } from '@/server/homepage';

/**
 * BRAND_ITEM — reusable component (DYNAMIC_DATA)
 * data_source_future: Supabase: brands
 * card: brand_logo / brand_name / brand_slug
 */
export function BrandItem({ brand }: { brand: HomeBrand }) {
  return (
    <Link
      href={`/products?brand=${encodeURIComponent(brand.slug || brand.name)}`}
      className="grid min-h-24 place-items-center rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md"
    >
      {brand.logo ? (
        // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
        <img
          src={brand.logo}
          alt=""
          loading="lazy"
          decoding="async"
          className="max-h-12 w-auto max-w-full object-contain"
        />
      ) : (
        <span className="text-sm font-black tracking-wide text-slate-800">{brand.name}</span>
      )}
      {brand.logo ? <span className="mt-1 text-[11px] font-bold text-slate-500">{brand.name}</span> : null}
    </Link>
  );
}
