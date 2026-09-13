import Link from 'next/link';
import type { HomeBrand } from '@/server/homepage';
import { BrandLogo } from './brand-logo';

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
      <BrandLogo src={brand.logo} name={brand.name} />
    </Link>
  );
}
