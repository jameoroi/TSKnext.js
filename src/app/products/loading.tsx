export default function ProductsLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10"
      aria-busy="true"
      aria-label="กำลังโหลดรายการสินค้า"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
          <div className="mt-2 h-4 w-36 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-11 w-44 animate-pulse rounded-xl bg-slate-200" />
      </div>
      <div className="grid items-start gap-7 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden animate-pulse rounded-2xl border bg-white p-5 lg:block">
          <div className="h-11 rounded-xl bg-slate-100" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={`sk-cat-${i}`} className="h-8 rounded-lg bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={`sk-${i}`} className="overflow-hidden rounded-2xl border bg-white">
              <div className="aspect-square animate-pulse bg-slate-100" />
              <div className="space-y-2 p-4">
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-slate-100" />
                <div className="h-3.5 w-3/5 animate-pulse rounded bg-slate-100" />
                <div className="mt-1 h-5 w-1/2 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
