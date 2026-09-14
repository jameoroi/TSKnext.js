import { OperationsManager } from '@/components/admin/operations-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

const LOAD_BY_TAB: Record<string, string> = {
  orders: 'admin.orders.list',
  slips: 'admin.slips.list',
  returns: 'admin.returns.list',
  agents: 'admin.agents.list',
  customers: 'admin.customers.list',
  coupons: 'admin.coupons.list',
  reviews: 'admin.reviews.list',
  payouts: 'admin.payouts.list',
  suppliers: 'admin.suppliers.list',
  users: 'admin.users.list',
  media: 'admin.media.list',
  audit: 'admin.audit.list',
};

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function Page({ searchParams }: Props) {
  const query = await searchParams;
  const tab = LOAD_BY_TAB[String(query.tab || '')] ? String(query.tab) : 'orders';
  const [initial, session] = await Promise.all([
    safeLegacy<any>(LOAD_BY_TAB[tab], tab === 'customers' ? { q: '' } : {}, { [tab]: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        title="Operations Center"
        description="Orders · slips · returns · customers · reviews · suppliers · media · audit · advanced actions"
      />
      <OperationsManager
        initial={initial}
        csrf={String(session.csrf || '')}
        owner={session.admin_role === 'super_admin'}
        initialTab={tab}
      />
    </>
  );
}
