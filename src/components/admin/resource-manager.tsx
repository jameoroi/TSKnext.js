'use client';

import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { legacyRequest, LegacyApiError } from '@/lib/legacy-api.client';
import { scaleImageFile, uploadAdminImage } from '@/lib/admin-media.client';

export type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'checkbox' | 'select' | 'datetime-local' | 'image';
  ownerType?: string;
  maxEdge?: number;
  required?: boolean;
  placeholder?: string;
  readOnlyOnEdit?: boolean;
  help?: string;
  options?: Array<{ value: string; label: string }>;
};

type Row = Record<string, any>;

function errorText(error: unknown) {
  const code = error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const known: Record<string, string> = {
    invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    not_found: 'ไม่พบข้อมูลนี้ อาจถูกแก้ไขหรือลบไปแล้ว',
    invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง',
    category_in_use: 'หมวดหมู่นี้ยังถูกใช้งานโดยสินค้า จึงลบไม่ได้',
    brand_in_use: 'แบรนด์นี้ยังถูกใช้งานโดยสินค้า จึงลบไม่ได้',
    invalid_image: 'รูปภาพต้องเป็น HTTPS URL หรือรูปภาพที่รองรับ',
    invalid_code: 'โค้ดไม่ถูกต้อง ต้องมีอย่างน้อย 3 ตัวอักษร',
    forbidden_super_admin_only: 'รายการนี้ต้องใช้สิทธิ์ Super Admin',
  };
  return known[code] || code;
}

export function ResourceManager({ initialRows, fields, csrf, idKey = 'id', createAction, updateAction, deleteAction, reorderAction, fixed = {}, title }: {
  initialRows: Row[];
  fields: FieldDef[];
  csrf: string;
  idKey?: string;
  createAction?: string;
  updateAction?: string;
  deleteAction?: string;
  reorderAction?: string;
  fixed?: Record<string, unknown>;
  title: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const open = (row?: Row) => {
    setEditing(row || {});
    if (row) setForm({ ...row });
    else {
      const defaults: Row = { ...fixed };
      for (const field of fields) {
        if (field.type === 'checkbox' && defaults[field.key] === undefined) defaults[field.key] = true;
        if (field.type === 'select' && defaults[field.key] === undefined && field.options?.length) defaults[field.key] = field.options[0].value;
      }
      setForm(defaults);
    }
    setNotice(''); setError('');
  };

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    return term ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term)) : rows;
  }, [q, rows]);

  async function save() {
    const isNew = !editing?.[idKey];
    const action = isNew ? createAction : updateAction;
    if (!action) return;
    setBusy(true); setNotice(''); setError('');
    try {
      const out = await legacyRequest<any>(action, { ...fixed, ...form, csrf }, 'POST');
      const saved = out.product || out.category || out.brand || out.coupon || out.user || out.item || out.content || out.data || { ...form };
      const key = saved[idKey] ?? form[idKey];
      setRows((current) => isNew ? [saved, ...current] : current.map((row) => String(row[idKey]) === String(key) ? saved : row));
      setEditing(null);
      setNotice('บันทึกเรียบร้อย');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function remove(row: Row) {
    if (!deleteAction || !window.confirm(`ยืนยันการลบ ${String(row.name || row.code || row[idKey] || 'รายการนี้')} ?`)) return;
    setBusy(true); setNotice(''); setError('');
    try {
      await legacyRequest(deleteAction, { ...fixed, [idKey]: row[idKey], csrf }, 'POST');
      setRows((current) => current.filter((item) => String(item[idKey]) !== String(row[idKey])));
      setNotice('ลบเรียบร้อย');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function move(row: Row, delta: -1 | 1) {
    if (!reorderAction || q.trim()) return;
    const index = rows.findIndex((item) => String(item[idKey]) === String(row[idKey]));
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.length) return;
    const next = [...rows];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setBusy(true); setNotice(''); setError('');
    try {
      await legacyRequest(reorderAction, { ...fixed, order: next.map((item) => item[idKey]), csrf }, 'POST');
      setRows(next);
      setNotice('เรียงลำดับใหม่แล้ว');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-black">{title}</h2><p className="text-xs text-slate-500">{rows.length.toLocaleString('th-TH')} รายการ</p></div><div className="flex gap-2"><input value={q} onChange={(event) => setQ(event.target.value)} className="h-10 rounded-xl border bg-slate-50 px-3 text-sm" placeholder="ค้นหา…"/>{createAction && <button type="button" onClick={() => open()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-3 py-2 text-sm font-bold text-white"><Plus size={16}/>เพิ่ม</button>}</div></div>
    {notice && <p className="m-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {error && <p className="m-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{fields.slice(0, 6).map((field) => <th key={field.key} className="px-4 py-3">{field.label}</th>)}{(updateAction || deleteAction || reorderAction) && <th className="px-4 py-3 text-right">จัดการ</th>}</tr></thead><tbody>{filtered.map((row, index) => <tr key={String(row[idKey] ?? index)} className="border-t">{fields.slice(0, 6).map((field) => <td key={field.key} className="max-w-[280px] truncate px-4 py-3">{renderValue(row[field.key], field)}</td>)}{(updateAction || deleteAction || reorderAction) && <td className="px-4 py-3"><div className="flex justify-end gap-1">{reorderAction && <><button type="button" disabled={busy || Boolean(q.trim()) || rows.findIndex((item) => String(item[idKey]) === String(row[idKey])) === 0} onClick={() => void move(row, -1)} className="rounded-lg border p-2 disabled:opacity-30" aria-label="เลื่อนขึ้น" title={q.trim() ? 'ล้างคำค้นหาก่อนเรียงลำดับ' : 'เลื่อนขึ้น'}><ArrowUp size={15}/></button><button type="button" disabled={busy || Boolean(q.trim()) || rows.findIndex((item) => String(item[idKey]) === String(row[idKey])) === rows.length - 1} onClick={() => void move(row, 1)} className="rounded-lg border p-2 disabled:opacity-30" aria-label="เลื่อนลง" title={q.trim() ? 'ล้างคำค้นหาก่อนเรียงลำดับ' : 'เลื่อนลง'}><ArrowDown size={15}/></button></>}{updateAction && <button type="button" onClick={() => open(row)} className="rounded-lg border p-2" aria-label="แก้ไข"><Pencil size={15}/></button>}{deleteAction && <button type="button" disabled={busy} onClick={() => void remove(row)} className="rounded-lg border p-2 text-rose-700" aria-label="ลบ"><Trash2 size={15}/></button>}</div></td>}</tr>)}{!filtered.length && <tr><td className="px-4 py-10 text-center text-slate-400" colSpan={Math.max(1, Math.min(fields.length, 6) + ((updateAction || deleteAction || reorderAction) ? 1 : 0))}>ยังไม่มีข้อมูล</td></tr>}</tbody></table></div>

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setEditing(null); }}><div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-xl font-black">{editing[idKey] ? 'แก้ไข' : 'เพิ่ม'} {title}</h3><button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="ปิด"><X/></button></div><div className="mt-5 grid gap-4 md:grid-cols-2">{fields.map((field) => <FieldInput key={field.key} field={field} value={form[field.key]} isEdit={Boolean(editing[idKey])} csrf={csrf} ownerId={String(form[idKey] ?? '')} onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}/>)}</div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2"><X size={16}/>ยกเลิก</button><button type="button" disabled={busy} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2 font-bold text-white disabled:opacity-50"><Save size={16}/>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div></div></div>}
  </section>;
}

function FieldInput({ field, value, isEdit, csrf, ownerId, onChange }: { field: FieldDef; value: any; isEdit: boolean; csrf: string; ownerId: string; onChange: (value: any) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const locked = Boolean(isEdit && field.readOnlyOnEdit);
  const full = field.type === 'textarea' || field.type === 'image';

  async function pickImage(file: File | undefined) {
    if (!file || uploading || locked) return;
    setUploading(true); setUploadError('');
    try {
      const scaled = await scaleImageFile(file, field.maxEdge || 1400);
      const url = await uploadAdminImage(scaled, {
        csrf,
        ownerType: field.ownerType || 'resource',
        ownerId,
      });
      onChange(url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  return <label className={full ? 'md:col-span-2' : ''}><span className="mb-1.5 block text-sm font-semibold">{field.label}</span>
    {field.type === 'checkbox' ? <span className="flex h-11 items-center gap-2 rounded-xl border px-3"><input type="checkbox" checked={value !== false} onChange={(event) => onChange(event.target.checked)}/><span className="text-sm text-slate-600">เปิดใช้งาน</span></span>
      : field.type === 'textarea' ? <textarea value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} rows={5} required={field.required} placeholder={field.placeholder} className="w-full rounded-xl border p-3"/>
      : field.type === 'select' ? <select value={String(value ?? field.options?.[0]?.value ?? '')} onChange={(event) => onChange(event.target.value)} disabled={locked} className="h-11 w-full rounded-xl border bg-white px-3 disabled:bg-slate-100">{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : field.type === 'image' ? <div className="rounded-2xl border bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border bg-white">
              {String(value || '').trim() ? <img src={String(value)} alt="" className="h-full w-full object-contain p-2"/> : <ImagePlus className="text-slate-300" size={34}/>} 
            </div>
            <div className="grid content-start gap-2">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={uploading || locked} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void pickImage(file); }} className="w-full rounded-xl border bg-white p-2 text-xs disabled:opacity-50"/>
              <input type="text" value={String(value ?? '')} readOnly={locked} onChange={(event) => onChange(event.target.value)} placeholder="https://… หรืออัปโหลดไฟล์" className="h-10 w-full rounded-xl border bg-white px-3 text-xs read-only:bg-slate-100"/>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] leading-4 text-slate-500">{uploading ? 'กำลังย่อภาพและอัปโหลด…' : `ย่ออัตโนมัติไม่เกิน ${field.maxEdge || 1400}px ก่อนอัปโหลด`}</span>
                {String(value || '').trim() && !locked && <button type="button" onClick={() => onChange('')} className="rounded-lg border bg-white px-2 py-1 text-[10px] font-bold text-rose-700">ล้างรูป</button>}
              </div>
              {uploadError && <span className="text-xs font-semibold text-rose-700">{uploadError}</span>}
            </div>
          </div>
        </div>
      : <input type={field.type === 'number' ? 'number' : field.type === 'datetime-local' ? 'datetime-local' : 'text'} value={field.type === 'datetime-local' ? toLocalInput(value) : String(value ?? '')} onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)} required={field.required} readOnly={locked} placeholder={field.placeholder} className="h-11 w-full rounded-xl border px-3 read-only:bg-slate-100 read-only:text-slate-500"/>}
    {field.help && <span className="mt-1 block text-[10px] leading-4 text-slate-400">{field.help}</span>}
  </label>;
}

function renderValue(value: unknown, field: FieldDef) {
  if (field.type === 'checkbox') return value !== false ? <span className="font-bold text-emerald-700">เปิด</span> : <span className="text-slate-400">ปิด</span>;
  if (value == null || value === '') return <span className="text-slate-300">—</span>;
  if (field.type === 'image') return <img src={String(value)} alt="" className="h-10 w-14 rounded-lg border bg-white object-contain p-1"/>;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  if (field.type === 'select') return field.options?.find((option) => option.value === String(value))?.label || String(value);
  return String(value);
}

function toLocalInput(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
