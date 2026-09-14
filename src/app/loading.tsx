export default function Loading() {
  return (
    <div className="mx-auto grid min-h-[50vh] max-w-7xl place-items-center px-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-emerald-900">
        <span className="size-5 animate-spin rounded-full border-2 border-emerald-900/20 border-t-emerald-900" />
        กำลังโหลด…
      </div>
    </div>
  );
}
