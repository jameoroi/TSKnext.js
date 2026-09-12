'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileUp, HelpCircle, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';
import {
  explainProductTransferError,
  ROW_PROBLEMS,
  transferColumnHelp,
  transferExample,
  type ProductTransferSchema,
} from '@/features/catalog/product-transfer';
import {
  productCsvToWorkbook,
  productWorkbookSupported,
  productWorkbookToCsv,
} from '@/features/catalog/product-workbook';

type ImportMode = 'update' | 'create';

type PreviewProblem = { line?: number; error?: string; detail?: string };
type PreviewChange = { column?: string; before?: unknown; after?: unknown };
type PreviewPlan = { line?: number; name?: string; changes?: PreviewChange[] };
type ImportPreview = {
  rows?: number;
  matched?: number;
  will_change?: number;
  will_create?: number;
  unchanged?: number;
  problem_count?: number;
  held_columns?: string[];
  problems?: PreviewProblem[];
  plan?: PreviewPlan[];
  truncated_plan?: number;
  committed?: Record<string, unknown>;
};

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

function Tally({ label, value, tone = 'default' }: { label: string; value: unknown; tone?: 'default' | 'good' | 'bad' }) {
  const styles = tone === 'good' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : tone === 'bad' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-slate-50 text-slate-700';
  return <div className={`rounded-xl border px-4 py-3 ${styles}`}><strong className="block text-xl font-black">{Number(value || 0).toLocaleString('th-TH')}</strong><span className="text-xs font-semibold">{label}</span></div>;
}

export function ImportProducts({ csrf }: { csrf: string }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<ImportMode>('update');
  const [keepStock, setKeepStock] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);

  const schemaQuery = useQuery({
    queryKey: ['admin.products.export.schema'],
    queryFn: () => legacyRequest<ProductTransferSchema & { ok?: boolean }>('admin.products.export.schema'),
    staleTime: 5 * 60_000,
  });
  const schema = schemaQuery.data;
  const columnHelp = useMemo(() => transferColumnHelp(schema), [schema]);

  useEffect(() => { setXlsxReady(productWorkbookSupported()); }, []);

  function invalidatePreview() {
    setPreview(null);
    setNotice('');
    setError('');
  }

  function updateCsv(value: string) {
    setCsv(value);
    invalidatePreview();
  }

  async function downloadBlank(format: 'xlsx' | 'csv') {
    const blank = schema?.blank_form?.csv || '';
    if (!blank) {
      setError(schemaQuery.isPending ? 'กำลังโหลดโครงสร้างไฟล์ กรุณารอสักครู่' : 'ไม่พบแบบฟอร์มนำเข้าสินค้า');
      return;
    }
    setBusy(`blank-${format}`);
    setError('');
    try {
      if (format === 'xlsx' && xlsxReady) {
        const bytes = await productCsvToWorkbook(blank, schema);
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ตัวอย่างไฟล์นำเข้าสินค้าใหม่.xlsx');
      } else {
        downloadBlob(new Blob([blank], { type: 'text/csv;charset=utf-8' }), 'ตัวอย่างไฟล์นำเข้าสินค้าใหม่.csv');
      }
      setNotice('ดาวน์โหลดไฟล์ตัวอย่างแล้ว — กรอกในชีต “สินค้า” แล้วอัปโหลดกลับที่หน้านี้');
    } catch (cause) {
      setError(cause instanceof Error ? `สร้างไฟล์ตัวอย่างไม่สำเร็จ (${cause.message})` : 'สร้างไฟล์ตัวอย่างไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function onFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setError('');
    setNotice('');
    setPreview(null);

    if (/\.xlsx$/i.test(file.name)) {
      if (!xlsxReady) {
        setCsv('');
        setError('เบราว์เซอร์นี้อ่านไฟล์ Excel ไม่ได้ กรุณาใช้ Chrome, Edge หรือ Safari รุ่นใหม่ หรือส่งไฟล์เป็น .csv');
        return;
      }
      setBusy('read');
      try {
        const result = await productWorkbookToCsv(file);
        setCsv(result.csv);
        setNotice(`อ่านไฟล์ Excel แล้ว: ชีต “${result.sheetName}” ${result.rowCount.toLocaleString('th-TH')} แถว`);
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : '';
        setCsv('');
        setError(code.includes('not_a_zip')
          ? 'ไฟล์นี้ไม่ใช่ .xlsx จริง — ถ้าเป็น .xls รุ่นเก่า ให้เปิดใน Excel แล้วบันทึกใหม่เป็น Excel Workbook (.xlsx)'
          : code.includes('unsupported_runtime')
            ? 'เบราว์เซอร์นี้อ่านไฟล์ Excel ไม่ได้ กรุณาใช้ Chrome, Edge หรือ Safari รุ่นใหม่ หรือส่งไฟล์เป็น .csv'
            : 'อ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจไฟล์แล้วลองใหม่');
      } finally {
        setBusy('');
      }
      return;
    }

    try {
      setCsv(await file.text());
      setNotice(`อ่านไฟล์ ${file.name} แล้ว`);
    } catch {
      setCsv('');
      setError('อ่านไฟล์ไม่สำเร็จ');
    }
  }

  async function runPreview() {
    setBusy('preview');
    setNotice('');
    setError('');
    setPreview(null);
    try {
      const data = await legacyRequest<ImportPreview>('admin.products.import.preview', { csv, keep_stock: keepStock, mode }, 'POST');
      setPreview(data);
      setNotice(mode === 'create'
        ? `ตรวจไฟล์แล้ว: จะเพิ่มสินค้าใหม่ ${Number(data.will_create || 0).toLocaleString('th-TH')} รายการ`
        : `ตรวจไฟล์แล้ว: จะเปลี่ยน ${Number(data.will_change || 0).toLocaleString('th-TH')} รายการ`);
    } catch (cause) {
      setError(explainProductTransferError(cause));
    } finally {
      setBusy('');
    }
  }

  async function runCommit() {
    const work = Number(preview?.will_change || preview?.will_create || 0);
    if (!work || preview?.committed) return;
    setBusy('commit');
    setNotice('');
    setError('');
    try {
      const result = await legacyRequest<Record<string, unknown>>('admin.products.import.commit', { csv, keep_stock: keepStock, mode, csrf }, 'POST');
      setPreview((current) => current ? { ...current, committed: result } : current);
      setNotice(mode === 'create'
        ? `นำเข้าสำเร็จ · สร้าง ${Number(result.created || 0).toLocaleString('th-TH')} รายการ · ไม่สำเร็จ ${Number(result.failed || 0).toLocaleString('th-TH')}`
        : `อัปเดตสำเร็จ ${Number(result.updated || 0).toLocaleString('th-TH')} รายการ · ข้าม ${Number(result.skipped || 0).toLocaleString('th-TH')} · ไม่สำเร็จ ${Number(result.failed || 0).toLocaleString('th-TH')}`);
    } catch (cause) {
      setError(explainProductTransferError(cause));
    } finally {
      setBusy('');
    }
  }

  const workCount = Number(preview?.will_change || preview?.will_create || 0);
  const placeholder = mode === 'create' ? 'name,sku,price\nปั๊มน้ำ…,MIT-001,4290' : 'id,name,price\n8f0e…,ปั๊มน้ำ…,4290';

  return <div className="grid gap-6">
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><div className="flex items-center gap-2 text-emerald-800"><FileSpreadsheet size={20}/><span className="text-xs font-black uppercase tracking-[.16em]">Safe Product Transfer</span></div><h2 className="mt-2 text-xl font-black">ยังไม่มีไฟล์?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">ดาวน์โหลดแบบฟอร์มที่ใช้ schema เดียวกับ importer จริง มีคำอธิบายทุกคอลัมน์ในไฟล์ Excel และไม่มีแถวตัวอย่างที่อาจถูกนำเข้าโดยไม่ตั้งใจ ถ้าจะแก้สินค้าเดิมให้ <Link href="/admin/products-export" className="font-bold text-emerald-800 underline">ส่งออกข้อมูลจริง</Link> มาก่อน</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!schema || !!busy || !xlsxReady} onClick={() => void downloadBlank('xlsx')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Download size={16}/>{busy === 'blank-xlsx' ? 'กำลังสร้าง…' : 'ตัวอย่าง Excel'}</button><button type="button" disabled={!schema || !!busy} onClick={() => void downloadBlank('csv')} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-50"><Download size={16}/>แบบ CSV</button></div>
      </div>
      {!xlsxReady && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Runtime นี้ไม่มี CompressionStream/DecompressionStream จึงใช้ CSV ได้ แต่ปิด Excel ชั่วคราว</p>}
    </section>

    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">1. เลือกว่าจะทำอะไร</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="รูปแบบการนำเข้า">
        <label className={`cursor-pointer rounded-2xl border p-4 transition ${mode === 'create' ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700' : 'hover:bg-slate-50'}`}><input type="radio" name="import-mode" value="create" checked={mode === 'create'} onChange={() => { setMode('create'); invalidatePreview(); }} className="sr-only"/><strong>นำเข้าสินค้าใหม่</strong><p className="mt-1 text-xs leading-5 text-slate-500">เพิ่มเฉพาะสินค้าที่ไม่มีอยู่แล้ว แถวที่ SKU/ชื่อซ้ำจะถูกปฏิเสธ ไม่เขียนทับของเดิม</p></label>
        <label className={`cursor-pointer rounded-2xl border p-4 transition ${mode === 'update' ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700' : 'hover:bg-slate-50'}`}><input type="radio" name="import-mode" value="update" checked={mode === 'update'} onChange={() => { setMode('update'); invalidatePreview(); }} className="sr-only"/><strong>อัปเดตสินค้าเดิม</strong><p className="mt-1 text-xs leading-5 text-slate-500">จับคู่ด้วย id หรือ SKU และแก้เฉพาะคอลัมน์ที่อยู่ในไฟล์ ไม่สร้างสินค้าใหม่อัตโนมัติ</p></label>
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{mode === 'create' ? <>ต้องมี <code>name</code> อย่างน้อย ไม่ต้องมี <code>id</code> ระบบจะสร้างให้เอง และ SKU ที่ซ้ำจะถูกปฏิเสธ</> : <>ระบบจับคู่ด้วย <code>id</code> ก่อน แล้วใช้ <code>sku</code> เป็น fallback แถวที่จับคู่ไม่ได้จะถูกข้าม ไม่สร้างใหม่</>}</p>
      {mode === 'update' && <label className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><input type="checkbox" checked={keepStock} onChange={(event) => { setKeepStock(event.target.checked); invalidatePreview(); }} className="mt-1 size-4"/><span><strong className="text-sm text-amber-950">ไม่แตะคอลัมน์สต็อก</strong><small className="mt-1 block text-xs leading-5 text-amber-800">แนะนำให้เปิดไว้ เพราะ stock เปลี่ยนเองทุกครั้งที่มีออเดอร์ การนำไฟล์เก่ากลับเข้าอาจย้อนจำนวนสต็อกกลับไปในอดีต ปิดเฉพาะตอนตั้งใจนับสต็อกใหม่จริง ๆ</small></span></label>}
    </section>

    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">2. เลือกไฟล์</h2>
      <div className="mt-4 grid gap-4">
        <label className="rounded-2xl border border-dashed p-5"><span className="flex items-center gap-2 text-sm font-bold"><FileUp size={17}/>ไฟล์ Excel (.xlsx) หรือ CSV</span><input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} className="mt-3 block w-full text-sm"/>{fileName && <small className="mt-2 block text-slate-500">ไฟล์ที่เลือก: {fileName}</small>}</label>
        <label><span className="mb-1.5 block text-sm font-bold">หรือวาง CSV ตรงนี้</span><textarea value={csv} onChange={(event) => updateCsv(event.target.value)} rows={9} spellCheck={false} className="w-full rounded-xl border p-3 font-mono text-xs outline-none focus:border-emerald-600" placeholder={placeholder}/></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!csv.trim() || !!busy} onClick={() => void runPreview()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><ShieldCheck size={16}/>{busy === 'preview' ? 'กำลังตรวจ…' : 'ตรวจก่อนนำเข้า'}</button><button type="button" onClick={() => setShowHelp((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"><HelpCircle size={16}/>{showHelp ? 'ซ่อนคำอธิบาย' : 'ดูคำอธิบายคอลัมน์'}</button></div>
      {!preview && <p className="mt-3 text-xs text-slate-500">ต้อง Preview และอ่านผลก่อน ปุ่มยืนยันจึงจะเปิดใช้งาน</p>}
    </section>

    {showHelp && <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-black">ความหมายของแต่ละคอลัมน์</h2>{schemaQuery.isPending ? <p className="mt-4 text-sm text-slate-500">กำลังโหลด schema…</p> : schemaQuery.isError ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">โหลด schema ไม่สำเร็จ</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">คอลัมน์</th><th className="p-2">ความหมาย</th><th className="p-2">แก้ได้ไหม</th><th className="p-2">ตัวอย่าง</th></tr></thead><tbody>{Object.entries(columnHelp).map(([key, info]) => <tr key={key} className="border-b last:border-0"><td className="p-2"><code>{key}</code></td><td className="p-2">{info.help}</td><td className="p-2">{info.read_only ? 'ไม่ได้ — ใช้จับคู่เท่านั้น' : 'ได้'}</td><td className="max-w-sm p-2 text-xs text-slate-500">{transferExample(schema, key)}</td></tr>)}</tbody></table></div>}<p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><b>กฎสำคัญ:</b> ระบบแก้เฉพาะคอลัมน์ที่อยู่ในไฟล์ ถ้าไฟล์มีแค่ <code>id,name,price</code> รายละเอียด รูป และคอลัมน์อื่นจะไม่ถูกแตะ</p></section>}

    {(notice || error) && <div className={`rounded-2xl border p-4 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    {preview && <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">3. ผลการตรวจ</h2><p className="mt-1 text-xs text-slate-500">ผลชุดนี้ผูกกับไฟล์ โหมด และการตั้งค่า stock ปัจจุบัน แก้อะไรแล้วต้อง Preview ใหม่</p></div>{preview.committed && <Link href="/admin/products" className="rounded-xl border px-3 py-2 text-xs font-bold">ไปดูรายการสินค้า</Link>}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5"><Tally label="แถวในไฟล์" value={preview.rows}/><Tally label={mode === 'create' ? 'พร้อมสร้าง' : 'จับคู่ได้'} value={mode === 'create' ? preview.will_create : preview.matched}/><Tally label={mode === 'create' ? 'จะสร้าง' : 'จะเปลี่ยน'} value={mode === 'create' ? preview.will_create : preview.will_change} tone="good"/><Tally label="เหมือนเดิม" value={preview.unchanged}/><Tally label="มีปัญหา" value={preview.problem_count} tone={Number(preview.problem_count || 0) > 0 ? 'bad' : 'default'}/></div>
      {!!preview.held_columns?.length && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800"><b>ข้ามคอลัมน์ {preview.held_columns.map((column) => <code key={column} className="mx-1">{column}</code>)}</b> ตามการตั้งค่า “ไม่แตะคอลัมน์สต็อก” คอลัมน์อื่นยังถูกนำเข้าตามปกติ</p>}
      {preview.committed && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">นำเข้าชุดนี้เรียบร้อยแล้ว ปุ่มยืนยันถูกล็อกเพื่อป้องกันการกดซ้ำ</p>}

      {!!preview.problems?.length && <div className="mt-6 overflow-x-auto"><h3 className="mb-2 font-black text-rose-800">แถวที่มีปัญหา</h3><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">บรรทัด</th><th className="p-2">ปัญหา</th><th className="p-2">รายละเอียด</th></tr></thead><tbody>{preview.problems.map((problem, index) => <tr key={`${problem.line}-${problem.error}-${index}`} className="border-b last:border-0"><td className="p-2">{problem.line}</td><td className="p-2 font-semibold text-rose-700">{ROW_PROBLEMS[String(problem.error || '')] || problem.error || 'unknown'}</td><td className="p-2">{problem.detail || '—'}</td></tr>)}</tbody></table></div>}

      {!!preview.plan?.length && <div className="mt-6 overflow-x-auto"><h3 className="mb-2 font-black">สิ่งที่จะเปลี่ยน</h3><table className="w-full min-w-[860px] text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">บรรทัด</th><th className="p-2">สินค้า</th><th className="p-2">คอลัมน์</th><th className="p-2">จากเดิม</th><th className="p-2">เป็น</th></tr></thead><tbody>{preview.plan.flatMap((row, rowIndex) => (row.changes || []).map((change, changeIndex) => <tr key={`${row.line}-${change.column}-${changeIndex}`} className="border-b last:border-0"><td className="p-2">{changeIndex === 0 ? row.line : ''}</td><td className="max-w-xs p-2 font-semibold">{changeIndex === 0 ? row.name : ''}</td><td className="p-2"><code>{change.column}</code></td><td className="max-w-xs break-words p-2 text-slate-500">{String(change.before || '(ว่าง)')}</td><td className="max-w-xs break-words p-2 font-semibold text-emerald-800">{String(change.after || '(ว่าง)')}</td></tr>))}</tbody></table>{Number(preview.truncated_plan || 0) > 0 && <p className="mt-3 text-xs text-slate-500">แสดง 200 รายการแรก อีก {Number(preview.truncated_plan).toLocaleString('th-TH')} รายการจะถูกนำเข้าด้วย</p>}</div>}

      <button type="button" disabled={!workCount || !!busy || Boolean(preview.committed)} onClick={() => void runCommit()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Upload size={17}/>{busy === 'commit' ? 'กำลังดำเนินการ…' : mode === 'create' ? `ยืนยันเพิ่มสินค้าใหม่ ${Number(preview.will_create || 0).toLocaleString('th-TH')} รายการ` : `ยืนยันอัปเดต ${Number(preview.will_change || 0).toLocaleString('th-TH')} รายการ`}</button>
    </section>}
  </div>;
}
