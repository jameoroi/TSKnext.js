import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerConsole } from '@/components/admin/owner-console';
import { AdminPageHeader } from '@/components/admin/page-header';
import { requireRole } from '@/server/auth/guards';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'Owner Console', robots: { index: false, follow: false } };

export default async function Page() {
  const session = await requireRole('owner', '/owner');
  const [dashboard, integrity, production] = await Promise.all([
    safeLegacy<any>('admin.dashboard.metrics', {}, { metrics: {} }),
    safeLegacy<any>('admin.catalog.integrity', {}, { status: 'unknown' }),
    safeLegacy<any>('admin.production.status', {}, { checks: {}, score: 0 }),
  ]);
  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          eyebrow="SUPER ADMIN"
          title="Owner Console"
          description="Production readiness · catalog integrity · backup/restore · incident visibility"
          actions={
            <Link href="/admin" className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white">
              Back Office
            </Link>
          }
        />
        <OwnerConsole
          initialMetrics={dashboard.metrics || {}}
          initialIntegrity={integrity}
          initialProduction={production}
          csrf={String(session.csrf || '')}
        />
      </div>
    </main>
  );
}
