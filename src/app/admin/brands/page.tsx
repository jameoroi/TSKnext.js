import { BrandMaintenance } from '@/components/admin/brand-maintenance';
import { AdminPageHeader } from '@/components/admin/page-header';
import { ResourceManager } from '@/components/admin/resource-manager';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [data, session] = await Promise.all([
    safeLegacy<{ brands?: Array<Record<string, unknown>> }>('admin.brands.list', {}, { brands: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader title="แบรนด์" description="Brand master · aliases · logo · storefront mapping" />
      <BrandMaintenance csrf={String(session.csrf || '')} />
      <ResourceManager
        title="แบรนด์"
        initialRows={data.brands || []}
        csrf={String(session.csrf || '')}
        idKey="id"
        createAction="admin.brands.create"
        updateAction="admin.brands.update"
        deleteAction="admin.brands.delete"
        reorderAction="admin.brands.reorder"
        fields={[
          { key: 'name', label: 'ชื่อแบรนด์', required: true },
          { key: 'id', label: 'ID', readOnlyOnEdit: true, help: 'ระบบสร้าง ID ให้อัตโนมัติ' },
          {
            key: 'aliases',
            label: 'Aliases',
            placeholder: 'Makita, MAKITA Thailand',
            help: 'คั่นหลายชื่อด้วย comma หรือขึ้นบรรทัดใหม่',
          },
          {
            key: 'logo_data_url',
            label: 'โลโก้แบรนด์',
            type: 'image',
            ownerType: 'brand',
            maxEdge: 800,
            help: 'ขนาดที่ต้องใส่ 600 × 300 px (2:1) PNG พื้นใส — หน้าร้านแสดงโลโก้สูง 48 px ไม่ครอป · อัปโหลดไฟล์หรือวาง URL ได้ หาก Media Storage ยังไม่ตั้งค่าจะ fallback ตาม backend เดิม',
          },
          { key: 'active', label: 'เปิดใช้งาน', type: 'checkbox' },
        ]}
      />
    </>
  );
}
