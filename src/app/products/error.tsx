'use client';

export default function ProductsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-center lg:px-6" role="alert">
      <h1 className="text-2xl font-black">โหลดรายการสินค้าไม่สำเร็จ</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        ระบบตอบช้ากว่าปกติ สินค้ายังอยู่ครบ ลองอีกครั้งได้เลย
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-xl bg-emerald-950 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800"
      >
        ลองอีกครั้ง
      </button>
    </div>
  );
}
