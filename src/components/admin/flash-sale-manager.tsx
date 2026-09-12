'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';

type Product = Record<string, any>;

export function FlashSaleManager({
  initialSettings,
  products,
  csrf,
}: {
  initialSettings: Record<string, any>;
  products: Product[];
  csrf: string;
}) {
  const [settings, setSettings] = useState(initialSettings || {});
  const [heading, setHeading] = useState(String(initialSettings?.home_headings?.flash || ''));
  const [endsAt, setEndsAt] = useState(String(initialSettings?.flash_sale_ends_at || '').slice(0, 10));
  const [count, setCount] = useState(Math.min(24, Math.max(1, Number(initialSettings?.flash_sale_count) || 4)));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const onSale = useMemo<Product[]>(() => products
    .filter((p) => p && p.state !== 'hidden' && p.state !== 'discontinued')
    .map((p) => {
      const price = Number(p.price || 0);
      const was = Number(p.oldPrice ?? p.old_price ?? 0);
      return { ...p, price, was, off: was > price ? was - price : 0 };
    })
    .filter((p) => p.off > 0)
    .sort((a, b) => b.off - a.off), [products]);

  const onShelf = onSale.slice(0, count);
  const nextUp = onSale.slice(count, count + 5);
  const configuredEnd = String(settings.flash_sale_ends_at || '').trim();
  const endMs = configuredEnd ? new Date(`${configuredEnd.slice(0, 10)}T23:59:59+07:00`).getTime() : Number.NaN;
  const daysLeft = Number.isFinite(endMs) ? Math.ceil((endMs - Date.now()) / 86_400_000) : null;
  const percentOff = (row: any) => row.was > 0 ? Math.round((row.off / row.was) * 100) : 0;
  const baht = (value: number) => Number(value || 0).toLocaleString('th-TH');

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const payload = await legacyRequest<any>('admin.site.settings', {
        home_headings: { ...(settings.home_headings || {}), flash: heading.trim() },
        flash_sale_ends_at: endsAt,
        flash_sale_count: Math.min(24, Math.max(1, Number(count) || 4)),
        csrf,
      }, 'POST');
      const next = payload?.settings || {
        ...settings,
        home_headings: { ...(settings.home_headings || {}), flash: heading.trim() },
        flash_sale_ends_at: endsAt,
        flash_sale_count: count,
      };
      setSettings(next);
      setNotice({ kind: 'ok', text: 'บันทึกการตั้งค่า Flash Sale แล้ว' });
    } catch (error) {
      setNotice({ kind: 'bad', text: `บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown_error'}` });
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-6">
    {notice && <p className={`rounded-2xl border p-4 text-sm font-semibold ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{notice.text}</p>}

    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">สินค้าถูกเลือกยังไง</h2>
      <p className="mt-2 text-sm text-slate-600">ระบบเรียงสินค้าที่มี <b>ราคาเดิมสูงกว่าราคาขาย</b> ตามส่วนลดที่มากที่สุด แล้วดึงอันดับแรกขึ้นชั้น Flash Sale อัตโนมัติ ไม่มี product picker แยก</p>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">ต้องการดันสินค้าเข้า Flash Sale ให้แก้ราคาเดิม/ราคาขายที่ <Link href="/admin/products" className="font-bold text-emerald-800 underline">จัดการสินค้า</Link></p>
    </section>

    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">สินค้าที่ขึ้นชั้นตอนนี้</h2><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{onShelf.length}/{count} รายการ</span></div>
      {onShelf.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">อันดับ</th><th className="p-2">สินค้า</th><th className="p-2 text-right">ราคาเดิม</th><th className="p-2 text-right">ราคาขาย</th><th className="p-2 text-right">ลด</th></tr></thead><tbody>{onShelf.map((row, index) => <tr key={String(row.id || row.sku || index)} className="border-b last:border-0"><td className="p-2 font-bold">#{index + 1}</td><td className="p-2">{String(row.name || row.id || '—')}</td><td className="p-2 text-right">฿{baht(row.was)}</td><td className="p-2 text-right font-semibold">฿{baht(row.price)}</td><td className="p-2 text-right font-bold text-rose-700">{percentOff(row)}%</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">ยังไม่มีสินค้าที่เข้าเงื่อนไข Flash Sale</p>}
      {!!nextUp.length && <div className="mt-5"><h3 className="font-bold">รออยู่ลำดับถัดไป</h3><ul className="mt-2 grid gap-2 text-sm text-slate-600">{nextUp.map((row) => <li key={String(row.id || row.sku)} className="rounded-xl bg-slate-50 px-3 py-2">{row.name} — ลด {percentOff(row)}%</li>)}</ul></div>}
    </section>

    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">ตั้งค่าชั้น Flash Sale</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="grid gap-1 text-sm"><span className="font-semibold">ชื่อชั้น</span><input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={60} placeholder="ลดแรง! สินค้าลดราคาวันนี้" className="rounded-xl border px-3 py-2"/><small className="text-slate-500">เว้นว่าง = ใช้ชื่อมาตรฐาน</small></label>
        <label className="grid gap-1 text-sm"><span className="font-semibold">จำนวนสินค้า 1–24</span><input value={count} onChange={(e) => setCount(Math.min(24, Math.max(1, Number(e.target.value) || 1)))} type="number" min={1} max={24} className="rounded-xl border px-3 py-2"/><small className="text-slate-500">ชั้นบนหน้าแรกเลื่อนได้อัตโนมัติ</small></label>
        <label className="grid gap-1 text-sm"><span className="font-semibold">นับถอยหลังถึงวันที่</span><input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} type="date" className="rounded-xl border px-3 py-2"/><small className="text-slate-500">เว้นว่าง = ไม่แสดงนาฬิกา</small></label>
      </div>
      {daysLeft !== null && <p className={`mt-4 rounded-xl p-3 text-sm ${daysLeft > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{daysLeft > 0 ? <>นาฬิกาเหลืออีก <b>{daysLeft}</b> วัน</> : 'วันที่ที่ตั้งไว้ผ่านมาแล้ว นาฬิกาจะไม่แสดง แต่ชั้นสินค้ายังทำงาน'}</p>}
      <button type="button" onClick={save} disabled={busy} className="mt-5 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white disabled:opacity-50">{busy ? 'กำลังบันทึก…' : 'บันทึก Flash Sale'}</button>
    </section>
  </div>;
}
