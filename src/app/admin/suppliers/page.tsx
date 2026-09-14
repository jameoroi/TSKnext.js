import { AdminPageHeader } from '@/components/admin/page-header';
import { SupplierNetworkManager } from '@/components/admin/supplier-network-manager';
import { requireRole } from '@/server/auth/guards';
import { safeLegacy } from '@/server/safe-legacy';

export default async function SupplierAdminPage() {
  const session = await requireRole('owner', '/admin/suppliers');
  const [suppliers, settlements, products] = await Promise.all([
    safeLegacy<any>('admin.suppliers.list', {}, { suppliers: [], error: 'suppliers_unavailable' }),
    safeLegacy<any>('admin.settlements.list', {}, { settlements: [], error: 'settlements_unavailable' }),
    safeLegacy<any>(
      'admin.products.list',
      { per_page: 500 },
      { products: [], error: 'products_unavailable' },
    ),
  ]);

  return (
    <>
      <AdminPageHeader
        eyebrow="SUPPLIER NETWORK"
        title="Supplier Management"
        description="Supplier profile · credentials · product assignment · fulfillment SLA · settlement ledger"
      />
      <SupplierNetworkManager
        initialSuppliers={Array.isArray(suppliers.suppliers) ? suppliers.suppliers : []}
        initialSettlements={Array.isArray(settlements.settlements) ? settlements.settlements : []}
        initialProducts={Array.isArray(products.products) ? products.products : []}
        csrf={String(session.csrf || '')}
        initialWarnings={[suppliers.error, settlements.error, products.error].filter(Boolean).map(String)}
      />
    </>
  );
}
