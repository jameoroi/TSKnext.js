import { AdminPageHeader } from '@/components/admin/page-header';
import { ResourceManager } from '@/components/admin/resource-manager';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [data, session] = await Promise.all([
    safeLegacy<any>('admin.categories.list', {}, { categories: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        title="หมวดหมู่สินค้า"
        description="Category master · storefront tile image · active state"
      />
      <ResourceManager
        title="หมวดหมู่สินค้า"
        initialRows={data.categories || []}
        csrf={String(session.csrf || '')}
        idKey="key"
        createAction="admin.categories.create"
        updateAction="admin.categories.update"
        deleteAction="admin.categories.delete"
        reorderAction="admin.categories.reorder"
        fields={[
          { key: 'name', label: 'ชื่อหมวดหมู่', required: true },
          {
            key: 'key',
            label: 'Key / Slug',
            readOnlyOnEdit: true,
            help: 'Key เป็น primary identifier เปลี่ยนหลังสร้างไม่ได้',
          },
          { key: 'icon', label: 'Icon' },
          {
            key: 'image_url',
            label: 'รูปหมวดหมู่',
            type: 'image',
            ownerType: 'category',
            maxEdge: 1200,
            help: 'อัปโหลดแล้วระบบย่อภาพก่อนส่งเข้า Media Storage; ยังวาง HTTPS URL ได้',
          },
          { key: 'active', label: 'เปิดใช้งาน', type: 'checkbox' },
        ]}
      />
    </>
  );
}
