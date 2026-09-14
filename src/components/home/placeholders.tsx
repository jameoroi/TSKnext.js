/**
 * PLACEHOLDER CARDS — DYNAMIC_DATA areas ที่ยังไม่มีข้อมูลจริงจาก Supabase
 * ----------------------------------------------------------------------------
 * กฎ: ห้ามใส่ชื่อสินค้า / ราคา / รุ่น / สต็อก / รูป demo แต่งขึ้นมา
 * แสดง skeleton + ข้อความที่ผู้ใช้เข้าใจได้ว่ารอข้อมูลจากระบบหลังบ้าน
 */

function Shell({
  testId,
  label,
  hint,
  className = '',
}: {
  testId: string;
  label: string;
  hint: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      data-testid={testId}
      aria-label={`${label} (รอข้อมูลจากระบบหลังบ้าน)`}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-100 p-4 text-center ${className}`}
    >
      <span className="animate-pulse grid size-12 place-items-center rounded-full bg-slate-200 text-lg font-black text-slate-400">
        …
      </span>
      <strong className="text-xs font-bold text-slate-700">{label}</strong>
      <small className="text-[11px] leading-4 text-slate-600">{hint}</small>
    </div>
  );
}

export function PromoBannerPlaceholder({ slot }: { slot: number }) {
  return (
    <div
      role="img"
      data-testid={`promo-banner-placeholder-${slot}`}
      aria-label={`ช่องแบนเนอร์โปรโมชั่นที่ ${slot} (รอข้อมูลจาก Supabase: banners)`}
      className="grid min-h-36 place-items-center rounded-3xl bg-slate-100 p-6 text-center"
    >
      <div>
        <p className="text-sm font-black text-slate-700">กำลังเตรียมแบนเนอร์โปรโมชั่น</p>
        <p className="mt-1 text-xs text-slate-600">แบนเนอร์จะแสดงเมื่อข้อมูลจากระบบหลังบ้านพร้อมใช้งาน</p>
      </div>
    </div>
  );
}

export function CategoryItemPlaceholder() {
  return (
    <Shell
      testId="category-item-placeholder"
      label="กำลังเตรียมหมวดหมู่สินค้า"
      hint="หมวดหมู่จะแสดงเมื่อข้อมูลจากระบบหลังบ้านพร้อมใช้งาน"
      className="min-h-36"
    />
  );
}

export function ProductCardPlaceholder() {
  return (
    <div
      role="img"
      data-testid="product-card-placeholder"
      aria-label="การ์ดสินค้า (กำลังเตรียมข้อมูลจากระบบหลังบ้าน)"
      className="overflow-hidden rounded-2xl bg-white shadow-sm"
    >
      <div className="animate-pulse aspect-square bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-3 w-1/3 rounded bg-slate-100" />
        <div className="animate-pulse h-4 w-full rounded bg-slate-100" />
        <div className="animate-pulse h-5 w-1/2 rounded bg-slate-100" />
        <p className="pt-1 text-center text-[11px] font-bold text-slate-600">กำลังเตรียมข้อมูลสินค้า</p>
      </div>
    </div>
  );
}

export function FlashSaleCardPlaceholder() {
  return (
    <div
      role="img"
      data-testid="flash-sale-card-placeholder"
      aria-label="การ์ดสินค้า Flash Sale (กำลังเตรียมข้อมูลจากระบบหลังบ้าน)"
      className="overflow-hidden rounded-2xl bg-white shadow-sm"
    >
      <div className="animate-pulse aspect-square bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-4 w-full rounded bg-slate-100" />
        <div className="animate-pulse h-5 w-2/3 rounded bg-slate-100" />
        <div className="animate-pulse h-1.5 w-full rounded-full bg-slate-100" />
        <p className="pt-1 text-center text-[11px] font-bold text-slate-600">กำลังเตรียมรายการ Flash Sale</p>
      </div>
    </div>
  );
}

export function ArticleCardPlaceholder() {
  return (
    <div
      role="img"
      data-testid="article-card-placeholder"
      aria-label="การ์ดบทความ (กำลังเตรียมข้อมูลจากระบบหลังบ้าน)"
      className="overflow-hidden rounded-2xl bg-white shadow-sm"
    >
      <div className="animate-pulse aspect-[4/3] bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-4 w-full rounded bg-slate-100" />
        <div className="animate-pulse h-3 w-1/2 rounded bg-slate-100" />
        <p className="pt-1 text-center text-[11px] font-bold text-slate-600">กำลังเตรียมบทความและเคล็ดลับ</p>
      </div>
    </div>
  );
}

export function BrandItemPlaceholder() {
  return (
    <Shell
      testId="brand-item-placeholder"
      label="กำลังเตรียมแบรนด์สินค้า"
      hint="โลโก้และชื่อแบรนด์จะแสดงเมื่อข้อมูลพร้อมใช้งาน"
      className="min-h-24"
    />
  );
}
