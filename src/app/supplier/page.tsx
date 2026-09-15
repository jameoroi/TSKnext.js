import type { Metadata } from 'next';
import { SupplierDashboard } from '@/components/portal/supplier-dashboard';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'พอร์ทัลซัพพลายเออร์', robots: { index: false, follow: false } };
export default async function Page() {
  const [d, s] = await Promise.all([
    safeLegacy<any>(
      'supplier.dashboard',
      {},
      { supplier: {}, products: [], orders: [], settlements: [], totals: {} },
    ),
    getLegacySession(),
  ]);
  return <SupplierDashboard data={d} csrf={String(s.csrf || '')} />;
}
