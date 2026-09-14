import type { Metadata } from 'next';
import { AccountView } from '@/components/account/account-view';
import { requireRole } from '@/server/auth/guards';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'บัญชีของฉัน', robots: { index: false, follow: false } };

const TABS = ['orders', 'profile', 'addresses', 'chat', 'security'] as const;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole('customer', '/account');
  const [orders, addresses] = await Promise.all([
    safeLegacy<{ orders?: Array<Record<string, unknown>> }>('customer.orders', {}, { orders: [] }),
    safeLegacy<{ addresses?: Array<Record<string, unknown>> }>(
      'customer.addresses.list',
      {},
      { addresses: [] },
    ),
  ]);
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab = (TABS as readonly string[]).includes(raw || '')
    ? (raw as (typeof TABS)[number])
    : 'orders';
  return (
    <AccountView
      initialSession={session}
      initialOrders={orders.orders || []}
      initialAddresses={addresses.addresses || []}
      initialTab={initialTab}
    />
  );
}
