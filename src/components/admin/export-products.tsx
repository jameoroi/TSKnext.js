'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, HelpCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';
import {
  explainProductTransferError,
  transferColumnHelp,
  transferExample,
  type ProductTransferSchema,
} from '@/features/catalog/product-transfer';
import { productCsvToWorkbook, productWorkbookSupported } from '@/features/catalog/product-workbook';

type ExportFormat = 'xlsx' | 'csv';

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function ExportProducts() {
  const searchParams = useSearchParams();
  const pickedIds = useMemo(() => String(searchParams.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean), [searchParams]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [state, setState] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [xlsxReady, setXlsxReady] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const schemaQuery = useQuery({
    queryKey: ['admin.products.export.schema'],
    queryFn: () => legacyRequest<ProductTransferSchema & { ok?: boolean }>('admin.products.export.schema'),
    staleTime: 5 * 60_000,
  });
  const schema = schemaQuery.data;
  const columnHelp = useMemo(() => transferColumnHelp(schema), [schema]);
  const groups = schema?.groups || [];

  useEffect(() => {
    const supported = productWorkbookSupported();
    setXlsxReady(supported);
    if (supported) setFormat('xlsx');
  }, []);

  const exportColumns = useMemo(() => {
    const samples = schema?.samples || {};
    if (!chosen.length) return samples.all?.columns || [];
    const out: string[] = [];
    for (const key of chosen) for (const column of samples[key]?.columns || []) if (!out.includes(column)) out.push(column);
    return out;
  }, [chosen, schema]);

  function toggleGroup(key: string) {
    setChosen((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function runExport() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api?action=admin.products.export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groups: chosen,
          state: state || undefined,
          brand: brand || undefined,
          category: category || undefined,
          ids: pickedIds.length ? pickedIds : undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        throw Object.assign(new Error(String(body?.error || `http_${response.status}`)), { responseBody: body });
      }
      const csv = await response.text();
      let name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') || '')?.[1] || `products-${new Date().toISOString().slice(0, 10)}.csv`;
      let blob: Blob;
      if (format === 'xlsx' && xlsxReady) {
        const bytes = await productCsvToWorkbook(csv, schema);
        blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        name = `${name.replace(/\.csv$/i, '')}.xlsx`;
      } else {
        blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      }
      downloadBlob(blob, name);
      setMessage(`ดาวน์โหลด ${name} แล้ว`);
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith('http_') ? `ส่งออกไม่สำเร็จ (${cause.message})` : explainProductTransferError(cause));
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-6">
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3 rounded-xl border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm text-emerald-950"><ShieldCheck className="mt-0.5 shrink-0" size={19}/><div><strong>หน้านี้อ่านอย่างเดียว</strong><p className="mt-1 text-xs leading-5 text-emerald-800">การส่งออกไม่แก้สินค้า ไม่แก้สต็อก และไม่ต้องใช้ CSRF token ไฟล์ที่ได้มาจาก schema เดียวกับ importer</p></div></div>
      {pickedIds.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">กำลังส่งออกเฉพาะ <b>{pickedIds.length.toLocaleString('th-TH')}</b> รายการที่เลือกจากหน้าสินค้า <Link href="/admin/products-export" className="font-bold underline">ส่งออกทั้งหมดแทน</Link></div>}

      <h2 className="mt-7 text-xl font-black">1. เลือกหัวข้อที่ต้องการ</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">ไม่เลือกอะไร = ทุกคอลัมน์ ระบบจะติด <code>id</code> และ <code>name</code> ตาม schema เพื่อให้รู้ว่าแถวไหนคือสินค้าอะไรและใช้จับคู่เมื่อนำกลับเข้า</p>
      {schemaQuery.isPending ? <p className="mt-4 text-sm text-slate-500">กำลังโหลด schema…</p> : schemaQuery.isError ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">โหลด schema ไม่สำเร็จ</p> : <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <label key={group.key} className={`cursor-pointer rounded-2xl border p-4 transition ${chosen.includes(group.key) ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700' : 'hover:bg-slate-50'}`}><input type="checkbox" checked={chosen.includes(group.key)} onChange={() => toggleGroup(group.key)} className="sr-only"/><strong className="text-sm">{group.label || group.key}</strong><small className="mt-1 block text-xs leading-5 text-slate-500">{group.note || ''}</small></label>)}</div>}

      <h2 className="mt-7 text-xl font-black">2. กรอง (ถ้าต้องการ)</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3"><label><span className="mb-1.5 block text-sm font-bold">สถานะ</span><select value={state} onChange={(event) => setState(event.target.value)} className="h-11 w-full rounded-xl border px-3 text-sm"><option value="">ทุกสถานะ</option><option value="active">ขายอยู่</option><option value="hidden">ซ่อน</option><option value="discontinued">เลิกขาย</option></select></label><label><span className="mb-1.5 block text-sm font-bold">แบรนด์</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="เว้นว่าง = ทุกแบรนด์" className="h-11 w-full rounded-xl border px-3 text-sm"/></label><label><span className="mb-1.5 block text-sm font-bold">หมวดหมู่</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="เว้นว่าง = ทุกหมวด" className="h-11 w-full rounded-xl border px-3 text-sm"/></label></div>

      <h2 className="mt-7 text-xl font-black">3. รูปแบบไฟล์</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="รูปแบบไฟล์"><label className={`rounded-2xl border p-4 ${format === 'xlsx' ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700' : ''} ${xlsxReady ? 'cursor-pointer' : 'opacity-50'}`}><input type="radio" name="export-format" value="xlsx" disabled={!xlsxReady} checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} className="sr-only"/><span className="flex items-center gap-2 font-bold"><FileSpreadsheet size={18}/>Excel (.xlsx)</span><small className="mt-1 block text-xs leading-5 text-slate-500">แนะนำ — ภาษาไทยไม่เพี้ยน, SKU ที่ขึ้นต้น 0 ไม่หาย, มีชีตคำอธิบายและ dropdown ค่า state</small></label><label className={`cursor-pointer rounded-2xl border p-4 ${format === 'csv' ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700' : ''}`}><input type="radio" name="export-format" value="csv" checked={format === 'csv'} onChange={() => setFormat('csv')} className="sr-only"/><span className="font-bold">CSV (.csv)</span><small className="mt-1 block text-xs leading-5 text-slate-500">เหมาะกับโปรแกรมบัญชีหรือระบบอื่นที่รับ CSV โดยตรง</small></label></div>
      {!xlsxReady && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">เบราว์เซอร์นี้สร้าง Excel ไม่ได้ จึงเลือก CSV ให้อัตโนมัติ</p>}

      <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><strong>คอลัมน์ที่จะได้ ({exportColumns.length.toLocaleString('th-TH')}):</strong><div className="mt-2 flex flex-wrap gap-1.5">{exportColumns.map((column) => <code key={column} className="rounded-md bg-white px-2 py-0.5 shadow-sm">{column}</code>)}</div></div>

      <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={busy || schemaQuery.isPending} onClick={() => void runExport()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"><Download size={17}/>{busy ? 'กำลังสร้างไฟล์…' : `ดาวน์โหลด${format === 'xlsx' ? ' Excel' : ' CSV'}${pickedIds.length ? ` (${pickedIds.length} รายการ)` : ''}`}</button><button type="button" onClick={() => setShowHelp((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"><HelpCircle size={16}/>{showHelp ? 'ซ่อนคำอธิบายคอลัมน์' : 'ดูคำอธิบายคอลัมน์ทั้งหมด'}</button></div>
      {(message || error) && <p className={`mt-4 rounded-xl p-3 text-sm font-semibold ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`} role={error ? 'alert' : 'status'}>{error || message}</p>}
    </section>

    {showHelp && <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-black">ความหมายของแต่ละคอลัมน์</h2><p className="mt-2 text-sm text-slate-500">คำอธิบายชุดเดียวกันนี้จะอยู่ในชีต “คำอธิบายคอลัมน์” ของไฟล์ Excel</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">คอลัมน์</th><th className="p-2">แก้ได้ไหม</th><th className="p-2">คำอธิบาย</th><th className="p-2">ตัวอย่าง</th></tr></thead><tbody>{Object.entries(columnHelp).map(([key, info]) => <tr key={key} className="border-b last:border-0"><td className="p-2"><code>{key}</code></td><td className="p-2">{info.read_only ? 'อ่านอย่างเดียว' : 'แก้ได้'}</td><td className="p-2">{info.help}</td><td className="max-w-sm p-2 text-xs text-slate-500">{transferExample(schema, key)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
