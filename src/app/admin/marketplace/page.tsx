import { MarketplaceManager } from '@/components/admin/marketplace-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';

export default async function Page() {
  const session = await getLegacySession();
  return (
    <>
      <AdminPageHeader
        title="Shopee / Lazada"
        description="OAuth · product catalogue · price/stock synchronization · raw sync diagnostics"
      />
      <MarketplaceManager
        initialShopee={{ connected: false }}
        initialLazada={{ connected: false }}
        csrf={String(session.csrf || '')}
      />
    </>
  );
}
