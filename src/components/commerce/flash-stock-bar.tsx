'use client';

/** แถบสต็อกคงเหลือสำหรับ Flash Sale */
export function FlashStockBar({ stock }: { stock: number }) {
  const percent = Math.round((Math.min(30, Math.max(0, stock)) / 30) * 100);
  return (
    <div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`เหลือสินค้า ${stock} ชิ้น`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-600 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(6, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] font-extrabold text-rose-700">
        เหลือ {Number(stock).toLocaleString('th-TH')} ชิ้น
      </p>
    </div>
  );
}
