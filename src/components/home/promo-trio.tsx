import { BadgePercent, Medal, Truck } from 'lucide-react';
import Link from 'next/link';

/** การ์ดโปร 3 ใบใต้ hero — ไม่พึ่งข้อมูลหลังบ้าน แสดงตลอด */
const CARDS = [
  {
    href: '/products?status=สินค้าลดราคา',
    icon: BadgePercent,
    bg: 'from-rose-600 via-red-600 to-orange-500',
    title: 'โปรแรง',
    big: 'ลดสูงสุด',
    desc: 'สินค้าลดราคา อัปเดตทุกวัน',
    cta: 'ช้อปเลย →',
  },
  {
    href: '/brands',
    icon: Medal,
    bg: 'from-emerald-700 via-emerald-600 to-teal-500',
    title: 'แบรนด์ชั้นนำ',
    big: 'ของแท้ 100%',
    desc: 'DeWalt Makita Milwaukee และอีกมาก',
    cta: 'ดูแบรนด์ทั้งหมด →',
  },
  {
    href: '/track-order',
    icon: Truck,
    bg: 'from-sky-700 via-blue-600 to-indigo-500',
    title: 'จัดส่งทั่วไทย',
    big: '1–3 วัน',
    desc: 'เก็บเงินปลายทางได้ ติดตามพัสดุได้',
    cta: 'ติดตามพัสดุ →',
  },
];

export function PromoTrio() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 lg:px-6" aria-label="โปรโมชันเด่น">
      <div className="grid gap-3 md:grid-cols-3">
        {CARDS.map(({ href, icon: Icon, bg, title, big, desc, cta }) => (
          <Link
            key={title}
            href={href}
            className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:p-6 ${bg}`}
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-white/20">
              <Icon className="size-6" />
            </span>
            <p className="mt-4 text-sm font-bold text-white/80">{title}</p>
            <p className="mt-1 text-3xl font-black tracking-tight">{big}</p>
            <p className="mt-1 text-sm text-white/80">{desc}</p>
            <span className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-900 transition group-hover:gap-3">
              {cta}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
