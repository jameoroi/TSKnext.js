import { InventoryManager } from '@/components/admin/inventory-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';
export default async function Page() {
  const [data, s] = await Promise.all([
    safeLegacy<any>('admin.inventory.overview', {}, { products: [], logs: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        title="คลังสินค้า"
        description="Inventory ledger · available/reserved · manual adjustments"
      />
      <InventoryManager
        initial={data}
        csrf={String(s.csrf || '')}
        owner={(s as any).admin_role === 'super_admin'}
      />
    </>
  );
}
