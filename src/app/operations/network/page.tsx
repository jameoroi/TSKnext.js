import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminDataTable } from '@/components/admin/data-table';
import { AdminPageHeader } from '@/components/admin/page-header';
import { requireRole } from '@/server/auth/guards';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'เครือข่ายซัพพลายเออร์', robots: { index: false, follow: false } };
export default async function Page() {
  await requireRole('admin', '/operations/network');
  const [i, r, e] = await Promise.all([
    safeLegacy<any>('admin.catalog.integrity', {}, {}),
    safeLegacy<any>('admin.production.status', {}, {}),
    safeLegacy<any>('admin.errors.list', { limit: 60 }, { errors: [], counts: {} }),
  ]);
  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          title="สถานะระบบข้อมูล"
          description="Integrity · production readiness · error log"
          actions={
            <Link
              className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white"
              href="/admin/operations"
            >
              Admin Operations
            </Link>
          }
        />
        <div className="grid gap-6">
          <AdminDataTable title="Catalog Integrity" rows={[i]} />
          <AdminDataTable title="Production Readiness" rows={[r]} />
          <AdminDataTable title={`Errors · วันนี้ ${e.counts?.last_day || 0}`} rows={e.errors || []} />
        </div>
      </div>
    </main>
  );
}
