import Link from 'next/link';

export type GridCategory = {
  key: string;
  name: string;
  en?: string;
  icon?: string | null;
  image?: string;
  sub?: string;
};

/**
 * ตารางหมวด 8 ช่อง — รูปจริงจาก CMS เท่านั้น (ไม่ใช้ไอคอน), พื้นหลังใส ไม่มีกรอบ
 * future: Supabase categories { category_image, category_name, category_slug }
 */
export function CategoryGrid({ categories }: { categories: GridCategory[] }) {
  if (!categories.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {categories.map((c) => (
        <Link
          key={c.key}
          href={`/products?category=${encodeURIComponent(c.key)}`}
          className="group min-w-0 text-center"
        >
          {c.image ? (
            // รูปหมวดจาก CMS — แสดงรูปเปลือย ไม่มีกล่อง/พื้นหลัง/กรอบใด ๆ
            // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
            <img
              src={c.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-square w-full object-cover transition duration-300 group-hover:opacity-90"
            />
          ) : (
            <span className="grid aspect-square w-full place-items-center bg-slate-100 p-2 text-center text-[11px] font-bold text-slate-400">
              CATEGORY_IMAGE
            </span>
          )}
          <strong className="mt-2 block truncate text-sm leading-6">{c.name}</strong>
          {c.sub ? (
            <small className="mt-0.5 block truncate text-[11px] leading-5 text-slate-400">({c.sub})</small>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
