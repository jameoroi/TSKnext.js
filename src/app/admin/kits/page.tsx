import { KitManager } from '@/components/admin/kit-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getProducts } from '@/server/catalog';

export default async function AdminEquipmentKitsPage() {
  const catalog = await getProducts({ page: 1, per_page: 250, status: 'active' });
  return (
    <>
      <AdminPageHeader
        title="ชุดอุปกรณ์ / Bundle"
        description="สร้างชุดสำเร็จรูป กำหนด Required/Optional Items ส่วนลด SEO และสถานะการขาย"
      />
      <KitManager products={catalog.products} />
    </>
  );
}
