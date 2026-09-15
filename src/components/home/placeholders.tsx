/**
 * PLACEHOLDER CARDS — shown where a home shelf has fewer items than slots.
 * ----------------------------------------------------------------------------
 * กฎ: ห้ามใส่ชื่อสินค้า / ราคา / รุ่น / สต็อก / รูป demo แต่งขึ้นมา
 * แสดงเป็นโครง (skeleton) เงียบ ๆ เท่านั้น — ข้อความสำหรับนักพัฒนา เช่น
 * "CATEGORY_ITEM — รอข้อมูล Supabase" เคยหลุดไปให้ลูกค้าเห็นบนหน้าร้าน
 */

function Shell({ testId, className = '' }: { testId: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-100/70 p-4 ${className}`}
    >
      <span className="animate-pulse size-12 rounded-full bg-slate-200/80" />
      <span className="animate-pulse h-3 w-2/3 rounded bg-slate-200/80" />
    </div>
  );
}

export function PromoBannerPlaceholder({ slot }: { slot: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid={`promo-banner-placeholder-${slot}`}
      className="animate-pulse min-h-36 rounded-3xl bg-slate-100/70"
    />
  );
}

export function CategoryItemPlaceholder() {
  return <Shell testId="category-item-placeholder" className="min-h-36" />;
}

export function ProductCardPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-testid="product-card-placeholder"
      className="overflow-hidden rounded-2xl bg-white/70 shadow-sm"
    >
      <div className="animate-pulse aspect-square bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-3 w-1/3 rounded bg-slate-100" />
        <div className="animate-pulse h-4 w-full rounded bg-slate-100" />
        <div className="animate-pulse h-5 w-1/2 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function FlashSaleCardPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-testid="flash-sale-card-placeholder"
      className="overflow-hidden rounded-2xl bg-white/70 shadow-sm"
    >
      <div className="animate-pulse aspect-square bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-4 w-full rounded bg-slate-100" />
        <div className="animate-pulse h-5 w-2/3 rounded bg-slate-100" />
        <div className="animate-pulse h-1.5 w-full rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function ArticleCardPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-testid="article-card-placeholder"
      className="overflow-hidden rounded-2xl bg-white/70 shadow-sm"
    >
      <div className="animate-pulse aspect-[4/3] bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-4 w-full rounded bg-slate-100" />
        <div className="animate-pulse h-3 w-1/2 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function BrandItemPlaceholder() {
  return <Shell testId="brand-item-placeholder" className="min-h-24" />;
}
