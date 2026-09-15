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
          className="tsk-pop tsk-pop-tile group min-w-0 rounded-3xl p-2 text-center"
        >
          {c.image ? (
            // รูปหมวดจาก CMS — วงกลมรูปจริง ไม่มีกล่อง/พื้นหลัง/กรอบใด ๆ
            // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
            <img
              src={c.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="mx-auto aspect-square w-full max-w-36 rounded-full object-cover"
            />
          ) : (
            <span className="mx-auto grid aspect-square w-full max-w-36 place-items-center rounded-full bg-emerald-800 p-2 text-center text-xl font-black text-white">
              {c.name.trim().charAt(0) || '•'}
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
