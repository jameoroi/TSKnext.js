'use client';

import { Copy, PackagePlus, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@/features/catalog/types';
import { productImage } from '@/features/catalog/types';
import { showToast } from '@/features/ui/toast-store';
import { Button } from '@/components/ui/button';

type SetLine = { productId: string; quantity: number; required: boolean; note?: string; variantId?: string | null };
type EquipmentSetRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  status: 'draft' | 'active' | 'hidden';
  imageUrl?: string | null;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: string | number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  items?: Array<{ productId: string; quantity: number; required: boolean; note?: string | null; variantId?: string | null }>;
};

type Draft = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'hidden';
  imageUrl: string;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  seoTitle: string;
  seoDescription: string;
  items: SetLine[];
};

const emptyDraft = (): Draft => ({ slug: '', name: '', description: '', status: 'draft', imageUrl: '', discountType: 'none', discountValue: 0, seoTitle: '', seoDescription: '', items: [] });

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function KitManager({ products }: { products: Product[] }) {
  const [sets, setSets] = useState<EquipmentSetRow[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const productMap = useMemo(() => new Map(products.map((product) => [String(product.id), product])), [products]);
  const picked = useMemo(() => new Set(draft.items.map((item) => item.productId)), [draft.items]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => !picked.has(String(product.id)) && (!query || `${product.name} ${product.sku || ''} ${product.brand || ''}`.toLowerCase().includes(query))).slice(0, 40);
  }, [products, picked, search]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch('/api/kits/manage?admin=1', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `http_${response.status}`);
      setSets(Array.isArray(data.sets) ? data.sets : []);
    } catch (error) {
      showToast(`โหลดชุดอุปกรณ์ไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown_error'}`, { tone: 'bad' });
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  function edit(row: EquipmentSetRow) {
    setDraft({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: String(row.description || ''),
      status: row.status || 'draft',
      imageUrl: String(row.imageUrl || ''),
      discountType: row.discountType || 'none',
      discountValue: Number(row.discountValue || 0),
      seoTitle: String(row.seoTitle || ''),
      seoDescription: String(row.seoDescription || ''),
      items: Array.isArray(row.items) ? row.items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity || 1), required: item.required !== false, note: String(item.note || ''), variantId: item.variantId || null })) : [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clone(row: EquipmentSetRow) {
    edit(row);
    setDraft((current) => ({ ...current, id: undefined, name: `${row.name} (สำเนา)`, slug: `${row.slug}-copy-${Date.now().toString().slice(-4)}`, status: 'draft' }));
  }

  async function save() {
    if (draft.name.trim().length < 2) return showToast('กรอกชื่อชุดอุปกรณ์', { tone: 'bad' });
    const slug = slugify(draft.slug || draft.name);
    if (!slug) return showToast('Slug ต้องเป็นภาษาอังกฤษ/ตัวเลข เช่น electrician-starter-kit', { tone: 'bad' });
    if (!draft.items.length) return showToast('เพิ่มสินค้าอย่างน้อย 1 รายการ', { tone: 'bad' });
    setSaving(true);
    try {
      const response = await fetch('/api/kits/manage', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...draft, slug }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `http_${response.status}`);
      showToast('บันทึกชุดอุปกรณ์แล้ว', { tone: 'ok' });
      setDraft(emptyDraft());
      await load();
    } catch (error) {
      showToast(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown_error'}`, { tone: 'bad' });
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm('ลบชุดอุปกรณ์นี้ถาวรหรือไม่?')) return;
    try {
      const response = await fetch(`/api/kits/manage?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `http_${response.status}`);
      if (draft.id === id) setDraft(emptyDraft());
      setSets((current) => current.filter((row) => row.id !== id));
      showToast('ลบชุดอุปกรณ์แล้ว', { tone: 'ok' });
    } catch (error) { showToast(`ลบไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown_error'}`, { tone: 'bad' }); }
  }

  function patchLine(id: string, patch: Partial<SetLine>) {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.productId === id ? { ...item, ...patch } : item) }));
  }

  return <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_460px]">
    <div className="space-y-5">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-violet-700">CURATED BUNDLES</p><h2 className="mt-1 text-xl font-black">{draft.id ? 'แก้ไขชุดอุปกรณ์' : 'สร้างชุดอุปกรณ์ใหม่'}</h2><p className="mt-1 text-sm text-slate-500">สร้างชุดสำเร็จรูป กำหนดสินค้าที่จำเป็น/เสริม ส่วนลด และ SEO แล้วเปิดขายบนหน้าร้าน</p></div>{draft.id ? <button type="button" onClick={() => setDraft(emptyDraft())} className="rounded-xl border px-3 py-2 text-xs font-bold">สร้างชุดใหม่</button> : null}</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="ชื่อชุด"><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="h-11 w-full rounded-xl border px-3" placeholder="เช่น ชุดช่างไฟเริ่มต้น"/></Field>
          <Field label="Slug"><input value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: slugify(event.target.value) }))} className="h-11 w-full rounded-xl border px-3" placeholder="electrician-starter-kit"/></Field>
          <Field label="สถานะ"><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Draft['status'] }))} className="h-11 w-full rounded-xl border px-3"><option value="draft">Draft</option><option value="active">เปิดขาย</option><option value="hidden">ซ่อน</option></select></Field>
          <Field label="รูปชุด (URL)"><input value={draft.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} className="h-11 w-full rounded-xl border px-3" placeholder="https://..."/></Field>
          <Field label="ส่วนลด"><div className="grid grid-cols-[150px_1fr] gap-2"><select value={draft.discountType} onChange={(event) => setDraft((current) => ({ ...current, discountType: event.target.value as Draft['discountType'] }))} className="h-11 rounded-xl border px-3"><option value="none">ไม่มี</option><option value="percent">เปอร์เซ็นต์ %</option><option value="fixed">ลดบาท</option></select><input type="number" min="0" value={draft.discountValue} onChange={(event) => setDraft((current) => ({ ...current, discountValue: Math.max(0, Number(event.target.value) || 0) }))} className="h-11 rounded-xl border px-3"/></div></Field>
          <Field label="SEO Title"><input value={draft.seoTitle} onChange={(event) => setDraft((current) => ({ ...current, seoTitle: event.target.value }))} className="h-11 w-full rounded-xl border px-3"/></Field>
          <Field label="คำอธิบาย" className="md:col-span-2"><textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="w-full rounded-xl border px-3 py-2"/></Field>
          <Field label="SEO Description" className="md:col-span-2"><textarea rows={2} value={draft.seoDescription} onChange={(event) => setDraft((current) => ({ ...current, seoDescription: event.target.value }))} className="w-full rounded-xl border px-3 py-2"/></Field>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">สินค้าในชุด ({draft.items.length})</h2><p className="text-xs text-slate-500">Required = ต้องมีในชุด, Optional = ลูกค้าถอดออกได้</p></div><Button type="button" size="sm" onClick={() => setPickerOpen(!pickerOpen)}><Plus className="size-4"/>เพิ่มสินค้า</Button></div>
        {pickerOpen ? <div className="mt-4 rounded-2xl border bg-slate-50 p-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm" placeholder="ค้นหาสินค้า รุ่น SKU..."/></div><div className="mt-3 grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{filtered.map((product) => <button type="button" key={product.id} onClick={() => setDraft((current) => ({ ...current, items: [...current.items, { productId: String(product.id), quantity: 1, required: true, note: '' }] }))} className="flex items-center gap-2 rounded-xl border bg-white p-2 text-left hover:border-emerald-500"><div className="relative size-12 shrink-0 rounded-lg bg-slate-50"><Image src={productImage(product)} alt="" fill className="object-contain p-1" unoptimized={productImage(product).startsWith('data:')}/></div><span className="min-w-0"><strong className="line-clamp-2 text-xs">{product.name}</strong><small className="text-emerald-800">฿{Number(product.price || 0).toLocaleString('th-TH')}</small></span></button>)}</div></div> : null}
        <div className="mt-4 space-y-2">{draft.items.map((line, index) => { const product = productMap.get(line.productId); return <article key={`${line.productId}-${index}`} className="grid gap-3 rounded-2xl border p-3 md:grid-cols-[64px_minmax(0,1fr)_100px_130px_40px] md:items-center"><div className="relative size-16 rounded-xl bg-slate-50">{product ? <Image src={productImage(product)} alt="" fill className="object-contain p-1.5" unoptimized={productImage(product).startsWith('data:')}/> : null}</div><div className="min-w-0"><strong className="line-clamp-2 text-sm">{product?.name || line.productId}</strong>{product && Array.isArray((product as any).variants) && (product as any).variants.length ? <select value={line.variantId || ''} onChange={(event) => patchLine(line.productId, { variantId: event.target.value || null })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs"><option value="">ราคาหลัก / ไม่ล็อกตัวเลือก</option>{(product as any).variants.filter((variant: any) => variant?.state !== 'hidden' && variant?.state !== 'discontinued').map((variant: any) => <option key={String(variant.id || variant.sku || variant.label)} value={String(variant.id || '')}>{String(variant.label || variant.name || variant.sku || variant.id)} · ฿{Number(variant.price ?? product.price ?? 0).toLocaleString('th-TH')}</option>)}</select> : null}<input value={line.note || ''} onChange={(event) => patchLine(line.productId, { note: event.target.value })} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" placeholder="หมายเหตุ / เหตุผลที่อยู่ในชุด"/></div><input type="number" min="1" max="999" value={line.quantity} onChange={(event) => patchLine(line.productId, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="h-10 rounded-xl border px-3 text-sm"/><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={line.required} onChange={(event) => patchLine(line.productId, { required: event.target.checked })}/>{line.required ? 'Required' : 'Optional'}</label><button type="button" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((item) => item !== line) }))} className="grid size-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"><Trash2 className="size-4"/></button></article>; })}{!draft.items.length ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-400">ยังไม่มีสินค้าในชุด</div> : null}</div>
        <Button type="button" disabled={saving} onClick={() => void save()} size="lg" className="mt-5 w-full"><Save className="size-5"/>{saving ? 'กำลังบันทึก…' : 'บันทึกชุดอุปกรณ์'}</Button>
      </section>
    </div>

    <aside className="space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black">ชุดที่สร้างแล้ว</h2><p className="text-xs text-slate-500">{sets.length} ชุด</p></div><button type="button" disabled={loading} onClick={() => void load()} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">รีเฟรช</button></div><div className="mt-3 space-y-2">{sets.map((row) => <article key={row.id} className="rounded-2xl border p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{row.name}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${row.status === 'active' ? 'bg-emerald-100 text-emerald-800' : row.status === 'hidden' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-700'}`}>{row.status}</span></div><p className="mt-1 text-xs text-slate-400">/{row.slug} · {row.items?.length || 0} รายการ</p></div><div className="flex"><button type="button" onClick={() => edit(row)} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100" title="แก้ไข"><Pencil className="size-4"/></button><button type="button" onClick={() => clone(row)} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100" title="ทำสำเนา"><Copy className="size-4"/></button><button type="button" onClick={() => void remove(row.id)} className="grid size-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" title="ลบ"><Trash2 className="size-4"/></button></div></div></article>)}{loading ? <p className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</p> : !sets.length ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีชุดที่บันทึก</p> : null}</div></section>
      <section className="rounded-2xl bg-violet-950 p-5 text-white"><PackagePlus className="size-8 text-violet-200"/><h3 className="mt-3 font-black">Bundle rules</h3><p className="mt-2 text-sm leading-6 text-white/65">ชุดที่เปิดขายใช้สินค้าใน catalog เดิม ทำให้ราคาและสต็อกอ้างอิงจากสินค้าจริง ไม่สร้าง inventory แยกที่เสี่ยงยอดคลาดเคลื่อน</p></section>
    </aside>
  </div>;
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>;
}
