import Link from 'next/link';

/**
 * โปร 3 ใบใต้ hero — STATIC_UI แบบ mockup (ไม่พึ่งข้อมูลหลังบ้าน แสดงตลอด)
 * อนาคตถ้ามีแบนเนอร์ CMS (Supabase: banners) ค่อยสลับมาใช้ PromoBanners แทน
 */
const BRANDS = ['Makita', 'DEWALT', 'BOSCH', 'STANLEY', 'HITACHI'];

export function PromoTrio() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 lg:px-6" aria-label="โปรโมชันเด่น">
      <div className="grid gap-3 md:grid-cols-3">
        <Link
          href="/products?status=สินค้าลดราคา"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-orange-500 p-5 text-white shadow-sm tsk-pop sm:p-6"
        >
          <p className="text-2xl font-black italic">โปรแรง</p>
          <p className="text-lg font-bold">สินค้า ลดสูงสุด</p>
          <p className="mt-1 text-6xl font-black tracking-tight">
            70<span className="text-3xl">%</span>
          </p>
          <span className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-900">
            ช้อปเลย →
          </span>
        </Link>
        <Link
          href="/brands"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-600 p-5 text-white shadow-sm tsk-pop sm:p-6"
        >
          <p className="text-lg font-bold">สินค้าแบรนด์ชั้นนำ</p>
          <p className="text-xl font-black">ของแท้ 100%</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BRANDS.map((b) => (
              <span key={b} className="rounded bg-white/90 px-2 py-0.5 text-[11px] font-black text-slate-900">
                {b}
              </span>
            ))}
          </div>
          <span className="mt-4 inline-block text-sm font-bold">ดูสินค้าแบรนด์ทั้งหมด →</span>
        </Link>
        <Link
          href="/track-order"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-700 via-teal-600 to-emerald-600 p-5 text-white shadow-sm tsk-pop sm:p-6"
        >
          <p className="text-lg font-bold">จัดส่งทั่วไทย</p>
          <p className="text-4xl font-black">1–3 วัน</p>
          <p className="mt-1 text-sm text-white/85">เก็บเงินปลายทางได้</p>
          <span className="mt-4 inline-block rounded-xl bg-amber-400 px-4 py-2 text-sm font-black text-emerald-950">
            ดูรายละเอียด →
          </span>
        </Link>
      </div>
    </section>
  );
}
