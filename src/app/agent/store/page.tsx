import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminDataTable } from '@/components/admin/data-table';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'สินค้าร้านตัวแทน', robots: { index: false, follow: false } };
export default async function Page() {
  const d = await safeLegacy<any>('agent.dashboard', {}, { agent: {}, products: [] });
  const code = String(d.agent?.referral_code || '');
  const store = code
    ? await safeLegacy<any>('partner.store', { code }, { products: [], agent: d.agent })
    : { products: [], agent: d.agent };
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border bg-white p-6">
        <p className="text-sm text-slate-500">หน้าร้านของฉัน</p>
        <h2 className="text-2xl font-bold">{store.agent?.store_name || d.agent?.store_name || 'ร้านตัวแทน'}</h2>
        {code && (
          <div className="mt-4 flex flex-wrap gap-2">
            <code className="rounded-xl bg-slate-100 px-3 py-2 text-sm">/store?ref={code}</code>
            <Link
              href={`/store?ref=${encodeURIComponent(code)}`}
              className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white"
            >
              เปิดหน้าร้าน
            </Link>
          </div>
        )}
      </div>
      <AdminDataTable
        title="สินค้าในหน้าร้าน"
        rows={store.products || []}
        columns={[
          { key: 'name', label: 'สินค้า' },
          { key: 'brand', label: 'แบรนด์' },
          { key: 'price', label: 'ราคา' },
          { key: 'stock', label: 'สต็อก' },
        ]}
      />
    </div>
  );
}
