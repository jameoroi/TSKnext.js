import Link from 'next/link';
import { CategoryIcon } from '@/components/site/category-icon';

export type GridCategory = { key: string; name: string; en?: string; icon?: string | null; sub?: string };

/** ตารางหมวด 8 ช่องพร้อมไอคอนเส้นแบบ mockup — responsive 2→4→8 คอลัมน์ */
export function CategoryGrid({ categories }: { categories: GridCategory[] }) {
  if (!categories.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {categories.map((c) => (
        <Link
          key={c.key}
          href={`/products?category=${encodeURIComponent(c.key)}`}
          className="group rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md"
        >
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-800 transition group-hover:scale-110 group-hover:bg-emerald-800 group-hover:text-white">
            <CategoryIcon icon={c.icon} categoryKey={c.key} className="size-7" />
          </span>
          <strong className="mt-3 block text-sm leading-6">{c.name}</strong>
          {c.sub ? (
            <small className="mt-0.5 block text-[11px] leading-5 text-slate-400">({c.sub})</small>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
