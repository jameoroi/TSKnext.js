import { AdminPageHeader } from '@/components/admin/page-header';
import { ProductManager } from '@/components/admin/product-manager';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';



export default async function Page() {
  const [data, categoryData, session] = await Promise.all([
    safeLegacy<any>('admin.products.list', { page: 1, per_page: 50 }, { products: [], total: 0 }),
    safeLegacy<any>('categories.list', {}, { categories: [] }),
    getLegacySession(),
  ]);

  return <>
    <AdminPageHeader
      title="จัดการสินค้า"
      description="Product master · ราคา · Variant · SKU/Barcode · Inventory · รูปภาพ · สเปก · SEO"
    />
    <ProductManager
      initialRows={Array.isArray(data.products) ? data.products : []}
      initialTotal={Number(data.total || 0)}
      csrf={String(session.csrf || '')}
      categories={Array.isArray(categoryData.categories) ? categoryData.categories : []}
    />
  </>;
}
