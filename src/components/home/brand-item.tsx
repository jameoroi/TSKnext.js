import Link from 'next/link';
import type { HomeBrand } from '@/server/homepage';

/**
 * BRAND_ITEM — reusable component (DYNAMIC_DATA), โลโก้ล้วนพื้นหลังใส ไม่มีกรอบ
 * data_source_future: Supabase: brands
 * card: brand_logo / brand_name / brand_slug
 */
export function BrandItem({ brand }: { brand: HomeBrand }) {
  return (
    <Link
      href={`/products?brand=${encodeURIComponent(brand.slug || brand.name)}`}
      className="grid h-full w-full place-items-center p-1 text-center transition hover:opacity-80"
      aria-label={brand.name}
    >
      {brand.logo ? (
        // โลโก้แบรนด์เป็นไฟล์ nobg จาก CMS — ใช้ img ธรรมดา ไม่ครอบกรอบใด ๆ
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
    </Link>
  );
}
