import { AdminPageHeader } from '@/components/admin/page-header';
import { ResourceManager } from '@/components/admin/resource-manager';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [data, session] = await Promise.all([safeLegacy<any>('admin.coupons.list', {}, { coupons: [] }), getLegacySession()]);
  return <><AdminPageHeader title="คูปอง" description="Discount rules · shipping promotions · limits · schedule"/><ResourceManager title="คูปอง" initialRows={data.coupons || []} csrf={String(session.csrf || '')} idKey="code" createAction="admin.coupons.save" updateAction="admin.coupons.save" deleteAction="admin.coupons.delete" fields={[
    { key: 'code', label: 'โค้ด', required: true, readOnlyOnEdit: true, placeholder: 'SAVE100' },
    { key: 'type', label: 'ประเภท', type: 'select', options: [
      { value: 'percent', label: 'ลดเป็นเปอร์เซ็นต์' },
      { value: 'fixed', label: 'ลดเป็นจำนวนเงิน' },
      { value: 'shipping_free', label: 'ส่งฟรี' },
      { value: 'shipping_fixed', label: 'ลดค่าส่งจำนวนเงิน' },
      { value: 'shipping_percent', label: 'ลดค่าส่งเปอร์เซ็นต์' },
    ] },
    { key: 'value', label: 'มูลค่า', type: 'number' },
    { key: 'min_order', label: 'ยอดขั้นต่ำ', type: 'number' },
    { key: 'max_discount', label: 'ลดสูงสุด', type: 'number' },
    { key: 'usage_limit', label: 'จำนวนครั้งสูงสุด', type: 'number', help: '0 = ไม่จำกัด' },
    { key: 'start_at', label: 'เริ่มใช้งาน', type: 'datetime-local' },
    { key: 'end_at', label: 'สิ้นสุด', type: 'datetime-local' },
    { key: 'active', label: 'เปิดใช้งาน', type: 'checkbox' },
  ]}/></>;
}
