import { AdminPageHeader } from '@/components/admin/page-header';
import { OrdersManager } from '@/components/admin/orders-manager';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [data, slips, session] = await Promise.all([
    safeLegacy<any>('admin.orders.list', {}, { orders: [] }),
    safeLegacy<any>('admin.slips.list', {}, { slips: [] }),
    getLegacySession(),
  ]);
  return <><AdminPageHeader title="คำสั่งซื้อ" description="Order operations · payment slips · fulfillment · tracking · purchase orders"/><OrdersManager initialRows={data.orders || []} initialSlips={slips.slips || []} csrf={String(session.csrf || '')} initialSource={String(data.source || 'commerce')}/></>;
}
