import { ExportProducts } from '@/components/admin/export-products';
import { AdminPageHeader } from '@/components/admin/page-header';
export default function Page() {
  return (
    <>
      <AdminPageHeader title="ส่งออกสินค้า" description="Export product master สำหรับสำรองข้อมูลหรือแก้ไขแบบ batch" />
      <ExportProducts />
    </>
  );
}
