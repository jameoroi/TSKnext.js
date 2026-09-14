import { FlashSaleManager } from '@/components/admin/flash-sale-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [site, catalogue, session] = await Promise.all([
    safeLegacy<any>('site.settings', {}, { settings: {} }),
    safeLegacy<any>('admin.products.list', { page: 1, per_page: 500 }, { products: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        title="Flash Sale"
        description="Automatic discount ranking · shelf preview · countdown configuration"
      />
      <FlashSaleManager
        initialSettings={site.settings || {}}
        products={catalogue.products || []}
        csrf={String(session.csrf || '')}
      />
    </>
  );
}
