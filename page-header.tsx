export function AdminPageHeader({
  eyebrow = 'ADMIN',
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function MetricGrid({ metrics }: { metrics: Record<string, unknown> }) {
  const labels: Record<string, string> = {
    products: 'สินค้า',
    customers: 'ลูกค้า',
    orders: 'ออเดอร์',
    orders_today: 'ออเดอร์วันนี้',
    pending_orders: 'รอดำเนินการ',
    low_stock: 'สต็อกต่ำ',
    revenue: 'ยอดขายรวม',
    revenue_today: 'ยอดขายวันนี้',
    total_sales: 'ยอดขาย',
    commission: 'ค่าคอม',
    pending_commission: 'คอมรอจ่าย',
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {Object.entries(metrics || {})
        .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
        .slice(0, 12)
        .map(([k, v]) => (
          <article key={k} className="rounded-xl border bg-white p-3 shadow-sm">
            <p className="text-sm text-slate-500">{labels[k] || k.replaceAll('_', ' ')}</p>
            <strong className="mt-1 block text-xl font-black">
              {typeof v === 'number' && /(revenue|sales|commission|amount|total)/.test(k)
                ? `฿${v.toLocaleString('th-TH')}`
                : String(v)}
            </strong>
          </article>
        ))}
    </div>
  );
}
