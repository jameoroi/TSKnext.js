import Link from 'next/link';
import { PrintButton } from '@/components/admin/print-button';
import { safeLegacy } from '@/server/safe-legacy';



const baht = (value: unknown) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function itemsOf(order: any): any[] {
  return Array.isArray(order?.items) ? order.items : [];
}

function lineTotal(item: any) {
  return Number(item?.price || 0) * Number(item?.qty ?? item?.quantity ?? 0);
}

function suppliersOf(order: any) {
  const names = [...new Set(itemsOf(order).map((item: any) => String(item?.supplier_name || '').trim()).filter(Boolean))];
  return names.length ? names.join(', ') : 'คลังสินค้าของร้าน';
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.orders) ? sp.orders.join(',') : String(sp.orders || '');
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  const data = await safeLegacy<any>('admin.orders.list', {}, { orders: [] });
  const all = Array.isArray(data.orders) ? data.orders : [];
  const byId = new Map(all.map((order: any) => [String(order.id), order]));
  const rows = ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : [];
  const missing = Math.max(0, ids.length - rows.length);

  return <main className="min-h-screen bg-white p-4 text-slate-900 md:p-8 print:p-0">
    <div className="mx-auto max-w-[960px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/orders" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">← กลับไปคำสั่งซื้อ</Link>
        <p className="text-sm text-slate-500">{rows.length} ใบ{missing ? ` · ไม่พบ ${missing} รายการ` : ''}</p>
        <PrintButton disabled={!rows.length}/>
      </div>

      {!rows.length && <div className="rounded-2xl border border-dashed p-12 text-center text-slate-500 print:hidden">ไม่พบคำสั่งซื้อที่เลือก — กลับไปเลือกใหม่จากหน้าคำสั่งซื้อ</div>}

      <div className="space-y-7 print:space-y-0">{rows.map((order: any) => {
        const items = itemsOf(order);
        const itemSubtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
        return <article key={String(order.id)} className="break-inside-avoid rounded-2xl border border-slate-300 bg-white p-6 shadow-sm print:min-h-[275mm] print:rounded-none print:border-0 print:p-8 print:shadow-none print:[page-break-after:always] last:print:[page-break-after:auto]">
          <header className="flex items-start justify-between gap-5 border-b-[3px] border-emerald-900 pb-4"><div><h1 className="text-xl font-black tracking-tight md:text-2xl">ใบสั่งซื้อสินค้า / PURCHASE ORDER</h1><p className="mt-1 text-xs text-slate-500">THAISERKIT SUPPLY · เอกสารจัดซื้อเพื่อดำเนินการจัดส่ง</p></div><div className="shrink-0 text-right"><strong className="text-sm">PO-{order.order_no || order.id}</strong><p className="mt-1 text-xs text-slate-500">ออกเอกสาร {when(new Date())}</p></div></header>

          <div className="mt-5 grid gap-4 md:grid-cols-2"><section className="rounded-xl border p-4"><p className="text-xs font-black uppercase tracking-wider text-emerald-800">ผู้จัดส่ง / Supplier</p><strong className="mt-2 block">{suppliersOf(order)}</strong><p className="mt-2 text-xs leading-5 text-slate-500">อ้างอิงคำสั่งซื้อลูกค้า: {order.order_no || order.id}<br/>สั่งเมื่อ {when(order.created_at)}</p></section><section className="rounded-xl border p-4"><p className="text-xs font-black uppercase tracking-wider text-emerald-800">ปลายทางจัดส่ง</p><strong className="mt-2 block">{order.name || order.customer_name || '—'}</strong><p className="mt-2 text-xs leading-5 text-slate-500">{order.phone || '—'}<br/>{[order.address, order.province, order.zip].filter(Boolean).join(' ') || '—'}{(order.carrier || order.tracking_number) ? <><br/>ขนส่ง: {order.carrier || '—'}{order.tracking_number ? ` · ${order.tracking_number}` : ''}</> : null}</p></section></div>

          <h2 className="mt-6 text-sm font-black">รายการที่ต้องจัดส่ง</h2><div className="mt-2 overflow-hidden rounded-xl border"><table className="w-full text-xs"><thead className="bg-emerald-950 text-left text-white"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">สินค้า</th><th className="px-3 py-2 text-right">จำนวน</th><th className="px-3 py-2 text-right">ราคาขาย</th><th className="px-3 py-2 text-right">รวม</th></tr></thead><tbody>{items.map((item: any, index: number) => <tr key={String(item.id || `${item.sku || 'line'}-${index}`)} className="border-t"><td className="px-3 py-2 align-top">{index + 1}</td><td className="px-3 py-2"><strong>{item.name || '—'}</strong>{item.variant_label ? <span className="text-slate-500"> · {item.variant_label}</span> : null}{item.sku ? <small className="mt-0.5 block text-slate-500">SKU: {item.sku}</small> : null}</td><td className="px-3 py-2 text-right align-top">{Number(item.qty ?? item.quantity ?? 0).toLocaleString('th-TH')}</td><td className="px-3 py-2 text-right align-top">{baht(item.price)}</td><td className="px-3 py-2 text-right align-top font-bold">{baht(lineTotal(item))}</td></tr>)}</tbody></table></div>

          <div className="ml-auto mt-4 w-full max-w-sm overflow-hidden rounded-xl border text-xs"><div className="flex justify-between border-b px-3 py-2"><span>ยอดสินค้า</span><span>{baht(order.subtotal ?? itemSubtotal)}</span></div><div className="flex justify-between border-b px-3 py-2"><span>ค่าจัดส่ง</span><span>{Number(order.shipping) > 0 ? baht(order.shipping) : 'ฟรี'}</span></div>{Number(order.discount) > 0 && <div className="flex justify-between border-b px-3 py-2 text-rose-700"><span>ส่วนลด</span><span>-{baht(order.discount)}</span></div>}<div className="flex justify-between bg-emerald-50 px-3 py-3 text-sm font-black"><span>ยอดรวมทั้งสิ้น</span><span>{baht(order.total)} บาท</span></div></div>

          <p className="mt-5 border-l-4 border-emerald-700 bg-emerald-50 px-4 py-3 text-[11px] leading-5 text-slate-600">เอกสารนี้ออกโดย THAISERKIT SUPPLY เพื่อยืนยันรายการที่จำหน่ายและนำส่งให้บริษัทต้นทาง · วิธีชำระเงินของลูกค้า: {order.payment_method || '—'}</p>
          <div className="mt-14 grid grid-cols-3 gap-8 text-center text-[11px] text-slate-500">{['ผู้จัดทำเอกสาร', 'ผู้อนุมัติ', 'ผู้รับสินค้า'].map((label) => <div key={label}><div className="border-t border-slate-400 pt-2">{label}</div></div>)}</div>
        </article>;
      })}</div>
    </div>
  </main>;
}
