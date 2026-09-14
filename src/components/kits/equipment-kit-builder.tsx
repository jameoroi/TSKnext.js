'use client';

import {
  BadgeCheck,
  Bot,
  Boxes,
  Check,
  CircleDollarSign,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/features/cart/store';
import type { Product } from '@/features/catalog/types';
import { productHref, productImage } from '@/features/catalog/types';
import type { AiKitResponse, KitLine, SkillLevel } from '@/features/kits/types';
import { showToast } from '@/features/ui/toast-store';
import type { PublicEquipmentSet } from '@/server/equipment-kits';

const PRIORITY_LABEL = { essential: 'จำเป็น', recommended: 'แนะนำ', optional: 'เสริม' } as const;

function money(value: number) {
  return `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
}
function available(product: Product, variantId = '') {
  const variants = Array.isArray((product as any).variants) ? (product as any).variants : [];
  const variant = variantId ? variants.find((row: any) => String(row?.id || '') === variantId) : null;
  return Math.max(
    0,
    Math.trunc(Number(variant?.available ?? variant?.stock ?? product.available ?? product.stock ?? 0)),
  );
}
function variantLabel(product: Product, variantId = '') {
  const variants = Array.isArray((product as any).variants) ? (product as any).variants : [];
  const variant = variants.find((row: any) => String(row?.id || '') === variantId);
  return String(variant?.label || variant?.name || '');
}

export function EquipmentKitBuilder({
  products,
  categories,
  brands,
  presets = [],
}: {
  products: Product[];
  categories: string[];
  brands: string[];
  presets?: PublicEquipmentSet[];
}) {
  const addCart = useCartStore((state) => state.add);
  const setBundleClaim = useCartStore((state) => state.setBundleClaim);
  const [mode, setMode] = useState<'manual' | 'ai'>('ai');
  const [lines, setLines] = useState<KitLine[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [budget, setBudget] = useState(15000);
  const [job, setJob] = useState('');
  const [level, setLevel] = useState<SkillLevel>('beginner');
  const [owned, setOwned] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiMeta, setAiMeta] = useState<{
    title?: string;
    summary?: string;
    source?: string;
    warnings?: string[];
  }>({});
  const [activePreset, setActivePreset] = useState<PublicEquipmentSet | null>(null);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.product.price || 0) * line.qty, 0),
    [lines],
  );
  const remaining = budget > 0 ? budget - total : 0;
  const over = budget > 0 && remaining < 0;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => {
        if (category && String(product.category || '') !== category) return false;
        if (brand && String(product.brand || '') !== brand) return false;
        if (
          query &&
          !`${product.name} ${product.sku || ''} ${product.brand || ''} ${product.category || ''}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        return true;
      })
      .slice(0, 60);
  }, [products, search, category, brand]);

  function add(product: Product, reason = '', priority: KitLine['priority'] = 'recommended') {
    setLines((current) => {
      const found = current.find((line) => line.product.id === product.id);
      if (found)
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, qty: Math.min(available(product) || 999, line.qty + 1) }
            : line,
        );
      return [...current, { product, qty: 1, reason, priority }];
    });
  }

  function qty(id: string, amount: number, variantId = '') {
    setLines((current) =>
      current.map((line) =>
        line.product.id === id && String(line.variantId || '') === variantId
          ? {
              ...line,
              qty: Math.max(1, Math.min(available(line.product, line.variantId || '') || 999, amount)),
            }
          : line,
      ),
    );
  }

  function addAllToCart() {
    if (!lines.length) return;
    for (const line of lines) addCart(line.product, line.qty, line.variantId || '');
    setBundleClaim(
      activePreset
        ? {
            setId: activePreset.id,
            name: activePreset.name,
            slug: activePreset.slug,
            discountType: activePreset.discountType,
            discountValue: activePreset.discountValue,
          }
        : null,
    );
    showToast(
      activePreset
        ? `เพิ่มชุด “${activePreset.name}” ลงตะกร้าแล้ว ระบบจะตรวจส่วนลดชุดอีกครั้งในตะกร้า`
        : `เพิ่มชุดอุปกรณ์ ${lines.length} รายการลงตะกร้าแล้ว`,
      { tone: 'ok' },
    );
  }

  function loadPreset(preset: PublicEquipmentSet) {
    const map = new Map(products.map((product) => [String(product.id), product]));
    const next = preset.items.flatMap((item) => {
      const product = map.get(String(item.productId));
      const variantId = String(item.variantId || '');
      if (!product || available(product, variantId) <= 0) return [];
      return [
        {
          product,
          variantId: variantId || undefined,
          qty: Math.max(1, Math.min(available(product, variantId), Number(item.quantity || 1))),
          reason: item.note || (item.required ? 'สินค้าหลักของชุดสำเร็จรูป' : 'อุปกรณ์เสริมของชุด'),
          priority: item.required ? ('essential' as const) : ('optional' as const),
        },
      ];
    });
    setLines(next);
    setActivePreset(preset);
    setAiMeta({
      title: preset.name,
      summary: preset.description || 'ชุดสำเร็จรูปที่ทีมงานจัดไว้ สามารถแก้ไขก่อนใส่ตะกร้าได้',
      source: 'curated',
      warnings: next.length < preset.items.length ? ['บางรายการถูกข้ามเพราะสินค้าหมดหรือไม่อยู่ในแคตตาล็อกปัจจุบัน'] : [],
    });
    showToast(`โหลดชุด “${preset.name}” แล้ว`, { tone: 'ok' });
  }

  async function buildWithAi() {
    if (job.trim().length < 2) {
      showToast('บอกงานที่ต้องการทำก่อน เช่น ช่างไฟ ติดแอร์ งานไม้ หรือดูแลสวน', { tone: 'bad' });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/kits/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ job, budget, level, brand, owned, notes }),
      });
      const data = (await response.json()) as AiKitResponse & { error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || 'kit_ai_failed');
      const map = new Map(products.map((product) => [String(product.id), product]));
      const next = data.items.flatMap((item) => {
        const product = map.get(String(item.id));
        if (!product) return [];
        return [{ product, qty: item.qty, reason: item.reason, priority: item.priority } satisfies KitLine];
      });
      setLines(next);
      setActivePreset(null);
      setAiMeta({ title: data.title, summary: data.summary, source: data.source, warnings: data.warnings });
      showToast(data.source === 'ai' ? 'AI จัดชุดจากแคตตาล็อกจริงให้แล้ว' : 'จัดชุดจากแคตตาล็อกด้วยระบบสำรองให้แล้ว', {
        tone: 'ok',
      });
    } catch (error) {
      showToast(`จัดชุดไม่สำเร็จ: ${error instanceof Error ? error.message : 'unknown_error'}`, { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 p-6 text-white shadow-xl md:p-9">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.16em] text-emerald-100">
              <WandSparkles className="size-4" />
              Equipment Set Builder
            </span>
            <h1 className="mt-4 text-3xl font-black md:text-5xl">จัดเซ็ตอุปกรณ์ให้พอดีกับงานและงบ</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/70 md:text-base">
              เลือกเองทุกชิ้น หรือบอก AI ว่าจะทำงานอะไร มีงบเท่าไร และมีของอะไรอยู่แล้ว ระบบจะเลือกจากสินค้าในแคตตาล็อกจริง
              เช็กสต็อก และให้คุณแก้ชุดก่อนใส่ตะกร้า
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat value={String(lines.length)} label="รายการ" />
            <Stat value={money(total)} label="ราคารวม" />
            <Stat value={budget ? money(Math.max(0, remaining)) : 'ไม่จำกัด'} label="งบคงเหลือ" />
          </div>
        </div>
      </section>

      {presets.length ? (
        <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-700">
                CURATED BY THAISERKIT
              </p>
              <h2 className="mt-1 text-xl font-black">ชุดสำเร็จรูปจากทีมงาน</h2>
              <p className="mt-1 text-sm text-slate-500">โหลดเป็นจุดเริ่มต้นแล้วเปลี่ยนสินค้า/จำนวนก่อนใส่ตะกร้าได้</p>
            </div>
            <span className="text-xs font-bold text-slate-400">{presets.length} ชุด</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadPreset(preset)}
                className="overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
              >
                {preset.imageUrl ? (
                  <div className="relative aspect-[16/9] bg-slate-50">
                    <Image
                      src={preset.imageUrl}
                      alt={preset.name}
                      fill
                      className="object-cover"
                      unoptimized={preset.imageUrl.startsWith('data:')}
                    />
                  </div>
                ) : (
                  <div className="grid aspect-[16/9] place-items-center bg-emerald-50 text-emerald-800">
                    <Boxes className="size-10" />
                  </div>
                )}
                <div className="p-3">
                  <strong className="line-clamp-1 text-sm">{preset.name}</strong>
                  <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-slate-500">
                    {preset.description || 'ชุดอุปกรณ์ที่จัดไว้สำหรับงานเฉพาะทาง'}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <small className="font-bold text-emerald-700">
                      {preset.items.length} รายการ · โหลดชุด →
                    </small>
                    {preset.discountType !== 'none' && preset.discountValue > 0 ? (
                      <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">
                        {preset.discountType === 'percent'
                          ? `ลด ${preset.discountValue}%`
                          : `ลด ${money(preset.discountValue)}`}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="space-y-5">
          <div className="flex rounded-2xl border bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('ai')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${mode === 'ai' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Bot className="size-4" />
              ให้ AI เลือกให้
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${mode === 'manual' ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Boxes className="size-4" />
              เลือกเอง
            </button>
          </div>

          {mode === 'ai' ? (
            <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                  <Sparkles />
                </span>
                <div>
                  <h2 className="text-xl font-black">AI Equipment Planner</h2>
                  <p className="text-sm text-slate-500">AI เลือกได้เฉพาะสินค้าที่ระบบส่งมาจากแคตตาล็อกจริงเท่านั้น</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="text-sm font-bold">คุณจะเอาอุปกรณ์ไปทำงานอะไร?</span>
                  <textarea
                    value={job}
                    onChange={(event) => setJob(event.target.value)}
                    rows={3}
                    placeholder="เช่น ติดแอร์บ้าน 2 ห้อง, ทำงานไม้เฟอร์นิเจอร์, ชุดช่างไฟสำหรับออกไซต์..."
                    className="mt-1.5 w-full rounded-2xl border px-4 py-3 text-sm outline-none focus:border-violet-500"
                  />
                </label>
                <label>
                  <span className="text-sm font-bold">งบประมาณ (บาท)</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={budget}
                    onChange={(event) => setBudget(Math.max(0, Number(event.target.value) || 0))}
                    className="mt-1.5 h-11 w-full rounded-xl border px-3"
                  />
                </label>
                <label>
                  <span className="text-sm font-bold">ระดับผู้ใช้</span>
                  <select
                    value={level}
                    onChange={(event) => setLevel(event.target.value as SkillLevel)}
                    className="mt-1.5 h-11 w-full rounded-xl border px-3"
                  >
                    <option value="beginner">มือใหม่ / เริ่มต้น</option>
                    <option value="pro">ช่าง / ใช้งานประจำ</option>
                    <option value="expert">มืออาชีพ / งานหนัก</option>
                  </select>
                </label>
                <label>
                  <span className="text-sm font-bold">แบรนด์ที่อยากได้</span>
                  <select
                    value={brand}
                    onChange={(event) => setBrand(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border px-3"
                  >
                    <option value="">ไม่จำกัดแบรนด์</option>
                    {brands.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-bold">ของที่มีอยู่แล้ว</span>
                  <input
                    value={owned}
                    onChange={(event) => setOwned(event.target.value)}
                    placeholder="เช่น มีสว่าน มีมัลติมิเตอร์แล้ว"
                    className="mt-1.5 h-11 w-full rounded-xl border px-3"
                  />
                </label>
                <label className="md:col-span-2">
                  <span className="text-sm font-bold">เงื่อนไขเพิ่มเติม</span>
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="เช่น เน้นเบา, ใช้นอกไซต์, ต้องมีแบตสำรอง, ขอของคุ้มราคา"
                    className="mt-1.5 h-11 w-full rounded-xl border px-3"
                  />
                </label>
              </div>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void buildWithAi()}
                className="mt-5 w-full bg-violet-600 hover:bg-violet-700"
                size="lg"
              >
                <Sparkles className="size-5" />
                {busy ? 'AI กำลังวิเคราะห์แคตตาล็อก…' : 'ให้ AI จัดเซ็ตจากสินค้าจริง'}
              </Button>
              {aiMeta.title ? (
                <div className="mt-5 rounded-2xl bg-violet-50 p-4 text-sm text-violet-950">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{aiMeta.title}</strong>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase">
                      {aiMeta.source === 'ai' ? 'AI' : 'RULE ENGINE'}
                    </span>
                  </div>
                  <p className="mt-1 leading-6 text-violet-800">{aiMeta.summary}</p>
                  {aiMeta.warnings?.length ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                      {aiMeta.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="rounded-3xl border bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">เลือกสินค้าเข้าชุดเอง</h2>
                  <p className="text-sm text-slate-500">ค้นหา กรอง และเพิ่มทีละชิ้น ปรับจำนวนได้ในสรุปชุดด้านขวา</p>
                </div>
                <label className="text-xs font-bold text-slate-500">
                  งบประมาณ
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={budget}
                    onChange={(event) => setBudget(Math.max(0, Number(event.target.value) || 0))}
                    className="ml-2 h-10 w-36 rounded-xl border px-3 text-sm text-slate-900"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_190px_190px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ค้นหาชื่อสินค้า รุ่น SKU..."
                    className="h-11 w-full rounded-xl border pl-9 pr-3 text-sm"
                  />
                </div>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 rounded-xl border px-3 text-sm"
                >
                  <option value="">ทุกหมวด</option>
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  className="h-11 rounded-xl border px-3 text-sm"
                >
                  <option value="">ทุกแบรนด์</option>
                  {brands.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((product) => (
                  <article key={product.id} className="rounded-2xl border p-3">
                    <Link
                      href={productHref(product)}
                      className="relative block aspect-square overflow-hidden rounded-xl bg-slate-50"
                    >
                      <Image
                        src={productImage(product)}
                        alt={product.name}
                        fill
                        className="object-contain p-3"
                        unoptimized={productImage(product).startsWith('data:')}
                      />
                    </Link>
                    <p className="mt-2 text-[10px] font-black uppercase text-emerald-700">
                      {product.brand || product.category || 'สินค้า'}
                    </p>
                    <Link
                      href={productHref(product)}
                      className="mt-1 line-clamp-2 min-h-10 text-sm font-bold hover:text-emerald-800"
                    >
                      {product.name}
                    </Link>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <strong className="text-emerald-950">{money(Number(product.price || 0))}</strong>
                        <small
                          className={`block text-[10px] ${available(product) > 0 ? 'text-emerald-700' : 'text-rose-600'}`}
                        >
                          {available(product) > 0 ? `พร้อมใช้ ${available(product)} ชิ้น` : 'สินค้าหมด'}
                        </small>
                      </div>
                      <button
                        type="button"
                        disabled={available(product) <= 0}
                        onClick={() => add(product)}
                        className="grid size-9 place-items-center rounded-xl bg-emerald-950 text-white disabled:bg-slate-200"
                        aria-label={`เพิ่ม ${product.name}`}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </article>
                ))}
                {!filtered.length ? (
                  <p className="col-span-full py-12 text-center text-sm text-slate-400">ไม่พบสินค้าในตัวกรองนี้</p>
                ) : null}
              </div>
            </section>
          )}
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <section className="overflow-hidden rounded-3xl border bg-white shadow-lg">
            <div className="border-b bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.14em] text-emerald-700">YOUR KIT</p>
                  <h2 className="mt-1 text-xl font-black">ชุดอุปกรณ์ของคุณ</h2>
                </div>
                <span className="grid size-11 place-items-center rounded-2xl bg-emerald-950 text-white">
                  <PackagePlus />
                </span>
              </div>
              {budget > 0 ? (
                <div className="mt-4">
                  <div className="flex justify-between text-xs font-bold">
                    <span>ใช้งบ {money(total)}</span>
                    <span className={over ? 'text-rose-600' : 'text-emerald-700'}>
                      {over ? `เกิน ${money(Math.abs(remaining))}` : `เหลือ ${money(remaining)}`}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${over ? 'bg-rose-500' : 'bg-emerald-600'}`}
                      style={{ width: `${Math.min(100, budget ? (total / budget) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="max-h-[520px] divide-y overflow-y-auto">
              {lines.map((line) => (
                <div key={`${line.product.id}:${line.variantId || ''}`} className="p-4">
                  <div className="flex gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                      <Image
                        src={productImage(line.product)}
                        alt=""
                        fill
                        className="object-contain p-1.5"
                        unoptimized={productImage(line.product).startsWith('data:')}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <strong className="line-clamp-2 text-sm">{line.product.name}</strong>
                          {line.variantId ? (
                            <p className="mt-0.5 text-[11px] font-bold text-violet-700">
                              ตัวเลือก: {variantLabel(line.product, line.variantId)}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs font-black text-emerald-800">
                            {money(Number(line.product.price || 0) * line.qty)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setLines((current) =>
                              current.filter(
                                (item) =>
                                  !(
                                    item.product.id === line.product.id &&
                                    String(item.variantId || '') === String(line.variantId || '')
                                  ),
                              ),
                            )
                          }
                          className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="นำออก"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${line.priority === 'essential' ? 'bg-emerald-100 text-emerald-800' : line.priority === 'optional' ? 'bg-slate-100 text-slate-600' : 'bg-sky-100 text-sky-700'}`}
                        >
                          {PRIORITY_LABEL[line.priority || 'recommended']}
                        </span>
                        <div className="flex items-center rounded-lg border">
                          <button
                            type="button"
                            onClick={() => qty(line.product.id, line.qty - 1, line.variantId || '')}
                            className="grid size-7 place-items-center"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="min-w-7 text-center text-xs font-bold">{line.qty}</span>
                          <button
                            type="button"
                            onClick={() => qty(line.product.id, line.qty + 1, line.variantId || '')}
                            className="grid size-7 place-items-center"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </div>
                      {line.reason ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">{line.reason}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {!lines.length ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  <Boxes className="mx-auto mb-3 size-10" />
                  <p>ยังไม่มีสินค้าในชุด</p>
                  <p className="mt-1 text-xs">ให้ AI จัดให้หรือเลือกเองจากแคตตาล็อก</p>
                </div>
              ) : null}
            </div>
            <div className="border-t p-5">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">สินค้า</dt>
                  <dd className="font-bold">{lines.reduce((sum, line) => sum + line.qty, 0)} ชิ้น</dd>
                </div>
                {activePreset && activePreset.discountType !== 'none' && activePreset.discountValue > 0 ? (
                  <div className="flex justify-between text-rose-700">
                    <dt>ส่วนลดชุด</dt>
                    <dd className="font-bold">
                      {activePreset.discountType === 'percent'
                        ? `${activePreset.discountValue}%`
                        : money(activePreset.discountValue)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-lg">
                  <dt className="font-black">รวมก่อนส่วนลด</dt>
                  <dd className="font-black text-emerald-900">{money(total)}</dd>
                </div>
              </dl>
              <Button
                type="button"
                disabled={!lines.length || over}
                onClick={addAllToCart}
                size="lg"
                className="mt-4 w-full"
              >
                <ShoppingCart className="size-5" />
                {over ? 'ปรับชุดให้อยู่ในงบก่อน' : 'เพิ่มทั้งชุดลงตะกร้า'}
              </Button>
              {lines.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setLines([]);
                    setActivePreset(null);
                  }}
                  className="mt-2 w-full py-2 text-xs font-bold text-slate-400 hover:text-rose-600"
                >
                  ล้างชุดทั้งหมด
                </button>
              ) : null}
            </div>
          </section>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
            <span className="rounded-xl border bg-white p-2">
              <Check className="mx-auto mb-1 size-4 text-emerald-600" />
              เช็กสต็อก
            </span>
            <span className="rounded-xl border bg-white p-2">
              <CircleDollarSign className="mx-auto mb-1 size-4 text-emerald-600" />
              คุมงบ
            </span>
            <span className="rounded-xl border bg-white p-2">
              <BadgeCheck className="mx-auto mb-1 size-4 text-emerald-600" />
              สินค้าในร้านจริง
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <strong className="block text-sm md:text-lg">{value}</strong>
      <span className="text-white/60">{label}</span>
    </div>
  );
}
