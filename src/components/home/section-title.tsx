import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/** หัวข้อ section มาตรฐานของหน้าแรก — STATIC_UI (reusable) */
export function SectionTitle({
  eyebrow,
  title,
  href,
  linkLabel = 'ดูทั้งหมด',
}: {
  eyebrow: string;
  title: string;
  href: string;
  linkLabel?: string;
}) {
  return (
    <div className="sec-head mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold">{title}</h2>
      </div>
      <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-800">
        {linkLabel} <ArrowRight size={16} />
      </Link>
    </div>
  );
}
