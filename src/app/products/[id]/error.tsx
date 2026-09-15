'use client';

import Link from 'next/link';

// Shown when the product could not be loaded (storage or quota outage), so a
// shopper gets a retry instead of a "product not found" page for a real item.
export default function ProductError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="mx-auto grid max-w-xl place-items-center px-4 py-20 text-center">
      <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">ขออภัย</p>
      <h1 className="mt-2 text-2xl font-black text-slate-900">โหลดข้อมูลสินค้าไม่สำเร็จ</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">ระบบกำลังตอบช้าชั่วคราว สินค้ายังอยู่ กรุณาลองใหม่อีกครั้ง</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-emerald-950 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900"
        >
          ลองใหม่
        </button>
        <Link
          href="/products"
          className="rounded-xl border px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          ดูสินค้าทั้งหมด
        </Link>
      </div>
    </section>
  );
}
