'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

type ProductRow = Record<string, any> & { id: string; name?: string };

type VariantForm = {
  id: string;
  label: string;
  sku: string;
  barcode: string;
  price: number;
  oldPrice: number | null;
  cost_price: number;
  state: 'active' | 'hidden' | 'discontinued';
  is_default: boolean;
  stock: number | '';
  originalStock: number | null;
  existing: boolean;
};

type SpecRow = { key: string; value: string };

type ProductForm = {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  supplier_id: string;
  supplier_name: string;
  sku: string;
  barcode: string;
  price: number;
  oldPrice: number | null;
  cost_price: number;
  stock: number;
  low_stock_threshold: number;
  state: 'active' | 'hidden' | 'discontinued';
  home_featured: boolean;
  home_featured_order: number | null;
  review_video: string;
  img: string;
  imagesText: string;
  detailImagesText: string;
  desc: string;
  statusText: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  unit: string;
  model: string;
  warranty: string;
  origin: string;
  min_order_qty: number;
  specs: SpecRow[];
  variants: VariantForm[];
  variantsTouched: boolean;
};

type Props = {
  initialRows: ProductRow[];
  initialTotal: number;
  csrf: string;
  categories: Array<{ name?: string; key?: string }>;
};

const states = ['active', 'hidden', 'discontinued'] as const;

function blankVariant(index = 0): VariantForm {
  return {
    id: index === 0 ? 'default' : newVariantId(),
    label: index === 0 ? 'แบบมาตรฐาน' : `ตัวเลือก ${index + 1}`,
    sku: '',
    barcode: '',
    price: 0,
    oldPrice: null,
    cost_price: 0,
    state: 'active',
    is_default: index === 0,
    stock: 0,
    originalStock: null,
    existing: false,
  };
}

function blankForm(): ProductForm {
  return {
    id: '',
    name: '',
    slug: '',
    brand: '',
    category: '',
    supplier_id: '',
    supplier_name: '',
    sku: '',
    barcode: '',
    price: 0,
    oldPrice: null,
    cost_price: 0,
    stock: 0,
    low_stock_threshold: 5,
    state: 'active',
    home_featured: false,
    home_featured_order: null,
    review_video: '',
    img: '',
    imagesText: '',
    detailImagesText: '',
    desc: '',
    statusText: '',
    weight_kg: 0,
    length_cm: 0,
    width_cm: 0,
    height_cm: 0,
    unit: '',
    model: '',
    warranty: '',
    origin: '',
    min_order_qty: 1,
    specs: [],
    variants: [blankVariant()],
    variantsTouched: false,
  };
}

function newVariantId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function numberOrNull(value: unknown): number | null {
  if (value === '' || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function variantStock(variant: any) {
  const level = variant?.inventory?.main;
  if (level?.on_hand === null) return '';
  if (level?.on_hand !== undefined) return Math.max(0, Number(level.on_hand) || 0);
  if (variant?.stock !== undefined && variant?.stock !== null) return Math.max(0, Number(variant.stock) || 0);
  return 0;
}

function fromProduct(product: ProductRow): ProductForm {
  const rawVariants = Array.isArray(product.variants) && product.variants.length ? product.variants : [];
  const variants: VariantForm[] = rawVariants.length
    ? rawVariants.map((variant: any, index: number) => {
        const stock = variantStock(variant);
        return {
          id: String(variant.id || (index === 0 ? 'default' : newVariantId())),
          label: String(variant.label || (index === 0 ? 'แบบมาตรฐาน' : `ตัวเลือก ${index + 1}`)),
          sku: String(variant.sku || ''),
          barcode: String(variant.barcode || ''),
          price: Number(variant.price ?? product.price ?? 0) || 0,
          oldPrice: numberOrNull(variant.oldPrice ?? product.oldPrice),
          cost_price: Number(variant.cost_price ?? product.cost_price ?? 0) || 0,
          state: states.includes(variant.state) ? variant.state : 'active',
          is_default: variant.is_default === true || index === 0,
          stock,
          originalStock: stock === '' ? null : Number(stock),
          existing: true,
        };
      })
    : [
        {
          ...blankVariant(),
          sku: String(product.sku || ''),
          barcode: String(product.barcode || ''),
          price: Number(product.price || 0),
          oldPrice: numberOrNull(product.oldPrice),
          cost_price: Number(product.cost_price || 0),
          stock: Number(product.stock || 0),
          originalStock: Number(product.stock || 0),
          existing: true,
        },
      ];

  const specRows =
    product.specs && typeof product.specs === 'object'
      ? Object.entries(product.specs).map(([key, value]) => ({ key, value: String(value ?? '') }))
      : [];

  return {
    ...blankForm(),
    id: String(product.id || ''),
    name: String(product.name || ''),
    slug: String(product.slug || ''),
    brand: String(product.brand || ''),
    category: String(product.category || ''),
    supplier_id: String(product.supplier_id || ''),
    supplier_name: String(product.supplier_name || ''),
    sku: String(product.sku || ''),
    barcode: String(product.barcode || ''),
    price: Number(product.price || 0),
    oldPrice: numberOrNull(product.oldPrice),
    cost_price: Number(product.cost_price || 0),
    stock: Number(product.stock || 0),
    low_stock_threshold: Math.max(0, Number(product.low_stock_threshold ?? 5) || 0),
    state: states.includes(product.state) ? product.state : 'active',
    home_featured: product.home_featured === true,
    home_featured_order: numberOrNull(product.home_featured_order),
    review_video: String(product.review_video || ''),
    img: String(product.img || ''),
    imagesText: Array.isArray(product.images) ? product.images.map(String).filter(Boolean).join('\n') : '',
    detailImagesText: Array.isArray(product.detailImages)
      ? product.detailImages.map(String).filter(Boolean).join('\n')
      : '',
    desc: String(product.desc || product.description || ''),
    statusText: Array.isArray(product.status) ? product.status.map(String).join(', ') : '',
    weight_kg: Number(product.weight_kg || 0),
    length_cm: Number(product.length_cm || 0),
    width_cm: Number(product.width_cm || 0),
    height_cm: Number(product.height_cm || 0),
    unit: String(product.unit || ''),
    model: String(product.model || ''),
    warranty: String(product.warranty || ''),
    origin: String(product.origin || ''),
    min_order_qty: Math.max(1, Number(product.min_order_qty || 1)),
    specs: specRows,
    variants,
    variantsTouched: false,
  };
}

function displayError(error: unknown) {
  if (error instanceof LegacyApiError) {
    const blockers = Array.isArray((error.detail as any)?.blockers) ? (error.detail as any).blockers : [];
    if (error.code === 'variant_in_use' && blockers.length) {
      return `ลบตัวเลือกไม่ได้เพราะยังมีสต็อกหรือออเดอร์ค้างอยู่ (${blockers
        .map((row: any) => row.sku || row.variant_id)
        .filter(Boolean)
        .join(', ')})`;
    }
    if (error.code === 'sku_exists') return `SKU ซ้ำกับสินค้าอื่น: ${String((error.detail as any)?.sku || '')}`;
    if (error.code === 'barcode_exists')
      return `บาร์โค้ดซ้ำกับสินค้าอื่น: ${String((error.detail as any)?.barcode || '')}`;
    return error.code;
  }
  return error instanceof Error ? error.message : 'unknown_error';
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

export function ProductManager({ initialRows, initialTotal, csrf, categories }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal || initialRows.length);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const categoryNames = useMemo(
    () =>
      [...new Set(categories.map((row) => String(row.name || '')).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'th'),
      ),
    [categories],
  );
  const brands = useMemo(
    () =>
      [...new Set(rows.map((row) => String(row.brand || '')).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'th'),
      ),
    [rows],
  );
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (stateFilter && String(row.state || 'active') !== stateFilter) return false;
        if (brandFilter && String(row.brand || '') !== brandFilter) return false;
        return true;
      }),
    [rows, stateFilter, brandFilter],
  );
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const allChecked = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));
  const explicitVariants = Boolean(
    form && (form.variants.length > 1 || form.variants.some((variant) => variant.id !== 'default')),
  );

  async function load(nextPage = page, nextPerPage = perPage, nextQuery = query) {
    setBusy('load');
    setError('');
    try {
      const payload = await legacyRequest<any>('admin.products.list', {
        page: nextPage,
        per_page: nextPerPage,
        q: nextQuery,
      });
      const nextRows = Array.isArray(payload.products) ? payload.products : [];
      setRows(nextRows);
      setTotal(Number(payload.total || nextRows.length));
      setPage(Number(payload.page || nextPage));
      setSelected(new Set());
    } catch (err) {
      setError(`โหลดสินค้าไม่สำเร็จ: ${displayError(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function openEdit(row: ProductRow) {
    setBusy(`edit-${row.id}`);
    setError('');
    try {
      const payload = await legacyRequest<any>('admin.products.get', { id: row.id });
      setForm(fromProduct(payload.product || row));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(`เปิดสินค้าไม่สำเร็จ: ${displayError(err)}`);
    } finally {
      setBusy('');
    }
  }

  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateVariant(index: number, patch: Partial<VariantForm>) {
    setForm((current) => {
      if (!current) return current;
      const variants = current.variants.map((row, i) => (i === index ? { ...row, ...patch } : row));
      if (patch.is_default)
        variants.forEach((row, i) => {
          row.is_default = i === index;
        });
      return { ...current, variants, variantsTouched: true };
    });
  }

  function addVariant() {
    setForm((current) =>
      current
        ? {
            ...current,
            variants: [
              ...current.variants,
              {
                ...blankVariant(current.variants.length),
                price: current.price,
                cost_price: current.cost_price,
              },
            ],
            variantsTouched: true,
          }
        : current,
    );
  }

  function removeVariant(index: number) {
    setForm((current) => {
      if (!current || current.variants.length <= 1) return current;
      const variants = current.variants.filter((_, i) => i !== index);
      if (!variants.some((row) => row.is_default) && variants[0]) variants[0].is_default = true;
      return { ...current, variants, variantsTouched: true };
    });
  }

  function addSpec() {
    setForm((current) =>
      current ? { ...current, specs: [...current.specs, { key: '', value: '' }] } : current,
    );
  }

  function updateSpec(index: number, patch: Partial<SpecRow>) {
    setForm((current) =>
      current
        ? {
            ...current,
            specs: current.specs.map((row, i) => (i === index ? { ...row, ...patch } : row)),
          }
        : current,
    );
  }

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const isNew = !form.id;
      const sendVariants = form.variantsTouched || explicitVariants;
      const specs = Object.fromEntries(
        form.specs.map((row) => [row.key.trim(), row.value.trim()]).filter(([key]) => key),
      );
      const payload: Record<string, unknown> = {
        id: form.id || undefined,
        name: form.name,
        slug: form.slug,
        brand: form.brand,
        category: form.category,
        supplier_id: form.supplier_id,
        supplier_name: form.supplier_name,
        sku: form.sku,
        barcode: form.barcode,
        price: Number(form.price || 0),
        oldPrice: form.oldPrice,
        cost_price: Number(form.cost_price || 0),
        stock: Math.max(0, Number(form.stock || 0)),
        low_stock_threshold: Math.max(0, Number(form.low_stock_threshold || 0)),
        state: form.state,
        status: form.statusText
          .split(',')
          .map((row) => row.trim())
          .filter(Boolean)
          .slice(0, 10),
        home_featured: form.home_featured,
        home_featured_order: form.home_featured_order,
        img: form.img.trim(),
        images: lines(form.imagesText),
        detailImages: lines(form.detailImagesText),
        desc: form.desc,
        review_video: form.review_video,
        specs,
        weight_kg: Math.max(0, Number(form.weight_kg || 0)),
        length_cm: Math.max(0, Number(form.length_cm || 0)),
        width_cm: Math.max(0, Number(form.width_cm || 0)),
        height_cm: Math.max(0, Number(form.height_cm || 0)),
        unit: form.unit,
        model: form.model,
        warranty: form.warranty,
        origin: form.origin,
        min_order_qty: Math.max(1, Math.floor(Number(form.min_order_qty || 1))),
        csrf,
      };
      if (sendVariants) {
        payload.variants = form.variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          sku: variant.sku,
          barcode: variant.barcode,
          price: Math.max(0, Number(variant.price || 0)),
          oldPrice: variant.oldPrice,
          cost_price: Math.max(0, Number(variant.cost_price || 0)),
          state: variant.state,
          is_default: variant.is_default,
          ...(!variant.existing && variant.stock !== ''
            ? {
                inventory: {
                  main: {
                    on_hand: Math.max(0, Number(variant.stock || 0)),
                    reserved: 0,
                    reorder_point: Math.max(0, Number(form.low_stock_threshold || 0)),
                  },
                },
              }
            : {}),
        }));
      }

      const result = await legacyRequest<any>(
        isNew ? 'admin.products.create' : 'admin.products.update',
        payload,
        'POST',
      );
      const productId = String(result.product?.id || form.id || '');

      if (!isNew && sendVariants && productId) {
        for (const variant of form.variants) {
          if (!variant.existing || variant.stock === '' || variant.originalStock === null) continue;
          const nextStock = Math.max(0, Math.floor(Number(variant.stock || 0)));
          if (nextStock === variant.originalStock) continue;
          await legacyRequest(
            'admin.inventory.adjust',
            {
              product_id: productId,
              variant_id: variant.id,
              warehouse_id: 'main',
              set: nextStock,
              reason: 'product_editor',
              csrf,
            },
            'POST',
          );
        }
      }

      setNotice(isNew ? 'เพิ่มสินค้าเรียบร้อย' : 'บันทึกสินค้าเรียบร้อย');
      setForm(null);
      await load(isNew ? 1 : page);
    } catch (err) {
      setError(`บันทึกไม่สำเร็จ: ${displayError(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function toggleFeatured(row: ProductRow) {
    setBusy(`feature-${row.id}`);
    setError('');
    try {
      await legacyRequest(
        'admin.products.featured',
        { id: row.id, home_featured: row.home_featured !== true, csrf },
        'POST',
      );
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, home_featured: row.home_featured !== true } : item,
        ),
      );
      setNotice('เปลี่ยนสถานะสินค้าแนะนำแล้ว');
    } catch (err) {
      setError(`อัปเดตไม่สำเร็จ: ${displayError(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function closeProduct(row: ProductRow) {
    if (!window.confirm(`ปิดการขาย “${row.name || row.id}” ?`)) return;
    setBusy(`delete-${row.id}`);
    setError('');
    try {
      await legacyRequest('admin.products.delete', { id: row.id, csrf }, 'POST');
      setRows((current) =>
        current.map((item) => (item.id === row.id ? { ...item, state: 'discontinued' } : item)),
      );
      setNotice('ปิดการขายแล้ว');
    } catch (err) {
      setError(`ปิดการขายไม่สำเร็จ: ${displayError(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function bulkState(state: 'active' | 'hidden') {
    const ids = [...selected];
    if (!ids.length || !window.confirm(`เปลี่ยนสถานะสินค้า ${ids.length} รายการเป็น ${state} ?`)) return;
    setBusy('bulk');
    setError('');
    try {
      await legacyRequest('admin.products.bulk_update', { ids, patch: { state }, csrf }, 'POST');
      setRows((current) => current.map((row) => (selected.has(row.id) ? { ...row, state } : row)));
      setSelected(new Set());
      setNotice(`อัปเดต ${ids.length} รายการแล้ว`);
    } catch (err) {
      setError(`Bulk update ไม่สำเร็จ: ${displayError(err)}`);
    } finally {
      setBusy('');
    }
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allChecked) visibleRows.forEach((row) => next.delete(row.id));
      else visibleRows.forEach((row) => next.add(row.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const exportHref = selected.size
    ? `/admin/products-export?ids=${encodeURIComponent([...selected].join(','))}`
    : '/admin/products-export';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-bold"
        >
          <RefreshCcw size={16} className={busy === 'load' ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
        <Link
          href={exportHref}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-bold"
        >
          <Download size={16} />
          ส่งออก{selected.size ? ` (${selected.size})` : ''}
        </Link>
        <Link
          href="/admin/products-import"
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-bold"
        >
          <Upload size={16} />
          นำเข้า
        </Link>
        <button
          type="button"
          onClick={() => setForm(blankForm())}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-3 py-2 text-sm font-bold text-white"
        >
          <PackagePlus size={16} />
          เพิ่มสินค้า
        </button>
      </div>

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      )}

      {form && (
        <form onSubmit={saveProduct} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-5 py-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Product editor</p>
              <h2 className="text-xl font-black">{form.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
            </div>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-xl border bg-white p-2"
              aria-label="ปิดฟอร์ม"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-7 p-5 md:p-6">
            <EditorSection title="ข้อมูลหลัก" note="ชื่อ รหัส ราคา และสถานะที่ใช้ทั้งหน้าร้านและหลังบ้าน">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field className="md:col-span-2 xl:col-span-3" label="ชื่อสินค้า">
                  <input
                    required
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="สถานะ">
                  <select
                    value={form.state}
                    onChange={(e) => updateForm('state', e.target.value as ProductForm['state'])}
                    className="field-input"
                  >
                    <option value="active">ขายอยู่</option>
                    <option value="hidden">ซ่อน</option>
                    <option value="discontinued">เลิกขาย</option>
                  </select>
                </Field>
                <Field label="Slug">
                  <input
                    value={form.slug}
                    onChange={(e) => updateForm('slug', e.target.value)}
                    className="field-input"
                    placeholder="ปล่อยว่างให้ระบบสร้าง"
                  />
                </Field>
                <Field label="แบรนด์">
                  <input
                    value={form.brand}
                    onChange={(e) => updateForm('brand', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="หมวดหมู่">
                  <select
                    value={form.category}
                    onChange={(e) => updateForm('category', e.target.value)}
                    className="field-input"
                  >
                    <option value="">ยังไม่จัดหมวดหมู่</option>
                    {form.category && !categoryNames.includes(form.category) && (
                      <option value={form.category}>{form.category} (ค่าเดิม)</option>
                    )}
                    {categoryNames.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="ป้ายสินค้า">
                  <input
                    value={form.statusText}
                    onChange={(e) => updateForm('statusText', e.target.value)}
                    className="field-input"
                    placeholder="ขายดี, ส่งฟรี, ใหม่"
                  />
                </Field>
                <Field label="SKU">
                  <input
                    value={form.sku}
                    onChange={(e) => updateForm('sku', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="บาร์โค้ด">
                  <input
                    value={form.barcode}
                    onChange={(e) => updateForm('barcode', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="ราคาขาย">
                  <NumberInput value={form.price} setValue={(value) => updateForm('price', value)} />
                </Field>
                <Field label="ราคาเดิม">
                  <NullableNumberInput
                    value={form.oldPrice}
                    setValue={(value) => updateForm('oldPrice', value)}
                    placeholder="ไม่ลดราคา"
                  />
                </Field>
                <Field label="ต้นทุน">
                  <NumberInput
                    value={form.cost_price}
                    setValue={(value) => updateForm('cost_price', value)}
                  />
                </Field>
                <Field label={explicitVariants ? 'สต็อกรวม (อ่านจากตัวเลือก)' : 'สต็อก'}>
                  <NumberInput
                    value={form.stock}
                    setValue={(value) => updateForm('stock', value)}
                    disabled={explicitVariants}
                  />
                </Field>
                <Field label="เตือนสต็อกต่ำ">
                  <NumberInput
                    value={form.low_stock_threshold}
                    setValue={(value) => updateForm('low_stock_threshold', value)}
                  />
                </Field>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={form.home_featured}
                    onChange={(e) => updateForm('home_featured', e.target.checked)}
                    className="size-4"
                  />
                  <span>
                    <Sparkles size={15} className="mr-1 inline" />
                    สินค้าแนะนำหน้าแรก
                  </span>
                </label>
                <Field label="ลำดับสินค้าแนะนำ">
                  <NullableNumberInput
                    value={form.home_featured_order}
                    setValue={(value) => updateForm('home_featured_order', value)}
                    placeholder="อัตโนมัติ"
                  />
                </Field>
              </div>
              {form.oldPrice && form.oldPrice > form.price && (
                <p className="mt-3 text-xs font-bold text-rose-700">
                  ลด {Math.round((1 - form.price / form.oldPrice) * 100)}% จากราคาเดิม
                </p>
              )}
            </EditorSection>

            <EditorSection
              title="รูปภาพและเนื้อหา"
              note="URL หนึ่งบรรทัดต่อหนึ่งรูป รองรับภาพหลัก แกลเลอรี และภาพรายละเอียด"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="รูปหลัก" className="lg:col-span-2">
                  <div className="flex gap-2">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                      <ImageIcon size={18} />
                    </span>
                    <input
                      value={form.img}
                      onChange={(e) => updateForm('img', e.target.value)}
                      className="field-input"
                      placeholder="https://..."
                    />
                  </div>
                </Field>
                <Field label="รูปแกลเลอรี">
                  <textarea
                    rows={5}
                    value={form.imagesText}
                    onChange={(e) => updateForm('imagesText', e.target.value)}
                    className="field-input h-auto py-3 font-mono text-xs"
                    placeholder={'https://.../01.jpg\nhttps://.../02.jpg'}
                  />
                </Field>
                <Field label="รูปในรายละเอียด">
                  <textarea
                    rows={5}
                    value={form.detailImagesText}
                    onChange={(e) => updateForm('detailImagesText', e.target.value)}
                    className="field-input h-auto py-3 font-mono text-xs"
                  />
                </Field>
                <Field label="รายละเอียดสินค้า" className="lg:col-span-2">
                  <textarea
                    rows={8}
                    value={form.desc}
                    onChange={(e) => updateForm('desc', e.target.value)}
                    className="field-input h-auto py-3"
                  />
                </Field>
                <Field label="YouTube รีวิว" className="lg:col-span-2">
                  <input
                    type="url"
                    value={form.review_video}
                    onChange={(e) => updateForm('review_video', e.target.value)}
                    className="field-input"
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </Field>
              </div>
            </EditorSection>

            <EditorSection title="ข้อมูลการขายและขนส่ง" note="ข้อมูลผู้ผลิต ซัพพลายเออร์ และขนาดกล่องสำหรับงานคลัง/ขนส่ง">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="ซัพพลายเออร์">
                  <input
                    value={form.supplier_name}
                    onChange={(e) => updateForm('supplier_name', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="Supplier ID">
                  <input
                    value={form.supplier_id}
                    onChange={(e) => updateForm('supplier_id', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="รุ่น">
                  <input
                    value={form.model}
                    onChange={(e) => updateForm('model', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="หน่วยนับ">
                  <input
                    value={form.unit}
                    onChange={(e) => updateForm('unit', e.target.value)}
                    className="field-input"
                    placeholder="ชิ้น / กล่อง / เมตร"
                  />
                </Field>
                <Field label="รับประกัน">
                  <input
                    value={form.warranty}
                    onChange={(e) => updateForm('warranty', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="ผลิตที่">
                  <input
                    value={form.origin}
                    onChange={(e) => updateForm('origin', e.target.value)}
                    className="field-input"
                  />
                </Field>
                <Field label="สั่งขั้นต่ำ">
                  <NumberInput
                    value={form.min_order_qty}
                    setValue={(value) => updateForm('min_order_qty', Math.max(1, value))}
                  />
                </Field>
                <Field label="น้ำหนัก (กก.)">
                  <NumberInput
                    value={form.weight_kg}
                    setValue={(value) => updateForm('weight_kg', value)}
                    step="0.01"
                  />
                </Field>
                <Field label="ยาว (ซม.)">
                  <NumberInput
                    value={form.length_cm}
                    setValue={(value) => updateForm('length_cm', value)}
                    step="0.1"
                  />
                </Field>
                <Field label="กว้าง (ซม.)">
                  <NumberInput
                    value={form.width_cm}
                    setValue={(value) => updateForm('width_cm', value)}
                    step="0.1"
                  />
                </Field>
                <Field label="สูง (ซม.)">
                  <NumberInput
                    value={form.height_cm}
                    setValue={(value) => updateForm('height_cm', value)}
                    step="0.1"
                  />
                </Field>
              </div>
            </EditorSection>

            <EditorSection title="สเปกสินค้า" note="แสดงในแท็บข้อมูลจำเพาะของหน้าสินค้า">
              <div className="space-y-2">
                {form.specs.map((row, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,.6fr)_minmax(0,1fr)_44px]">
                    <input
                      value={row.key}
                      onChange={(e) => updateSpec(index, { key: e.target.value })}
                      className="field-input"
                      placeholder="หัวข้อ เช่น กำลังไฟ"
                    />
                    <input
                      value={row.value}
                      onChange={(e) => updateSpec(index, { value: e.target.value })}
                      className="field-input"
                      placeholder="ค่า เช่น 250 W"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) =>
                          current
                            ? { ...current, specs: current.specs.filter((_, i) => i !== index) }
                            : current,
                        )
                      }
                      className="grid size-11 place-items-center rounded-xl border text-rose-700"
                      aria-label="ลบสเปก"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addSpec}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
              >
                <Plus size={15} />
                เพิ่มสเปก
              </button>
            </EditorSection>

            <EditorSection
              title="ตัวเลือกสินค้า / Variants"
              note="SKU และบาร์โค้ดต้องไม่ซ้ำ สต็อกของตัวเลือกเดิมจะปรับผ่าน Inventory API เพื่อไม่ทำลาย reservation"
            >
              <div className="space-y-3">
                {form.variants.map((variant, index) => (
                  <div key={variant.id} className="rounded-2xl border bg-slate-50/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <strong>ตัวเลือก {index + 1}</strong>
                        <code className="ml-2 text-[10px] text-slate-400">{variant.id}</code>
                      </div>
                      <div className="flex gap-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-bold">
                          <input
                            type="radio"
                            checked={variant.is_default}
                            onChange={() => updateVariant(index, { is_default: true })}
                          />
                          ค่าเริ่มต้น
                        </label>
                        {form.variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVariant(index)}
                            className="rounded-lg border bg-white p-2 text-rose-700"
                            aria-label="ลบตัวเลือก"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Field label="ชื่อ/ตัวเลือก">
                        <input
                          value={variant.label}
                          onChange={(e) => updateVariant(index, { label: e.target.value })}
                          className="field-input"
                        />
                      </Field>
                      <Field label="SKU">
                        <input
                          value={variant.sku}
                          onChange={(e) => updateVariant(index, { sku: e.target.value })}
                          className="field-input"
                        />
                      </Field>
                      <Field label="บาร์โค้ด">
                        <input
                          value={variant.barcode}
                          onChange={(e) => updateVariant(index, { barcode: e.target.value })}
                          className="field-input"
                        />
                      </Field>
                      <Field label="สถานะ">
                        <select
                          value={variant.state}
                          onChange={(e) =>
                            updateVariant(index, { state: e.target.value as VariantForm['state'] })
                          }
                          className="field-input"
                        >
                          <option value="active">ขายอยู่</option>
                          <option value="hidden">ซ่อน</option>
                          <option value="discontinued">เลิกขาย</option>
                        </select>
                      </Field>
                      <Field label="ราคา">
                        <NumberInput
                          value={variant.price}
                          setValue={(value) => updateVariant(index, { price: value })}
                        />
                      </Field>
                      <Field label="ราคาเดิม">
                        <NullableNumberInput
                          value={variant.oldPrice}
                          setValue={(value) => updateVariant(index, { oldPrice: value })}
                        />
                      </Field>
                      <Field label="ต้นทุน">
                        <NumberInput
                          value={variant.cost_price}
                          setValue={(value) => updateVariant(index, { cost_price: value })}
                        />
                      </Field>
                      <Field label="สต็อกคลังหลัก">
                        <input
                          type="number"
                          min="0"
                          value={variant.stock}
                          onChange={(e) =>
                            updateVariant(index, {
                              stock: e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="field-input"
                          placeholder="ไม่จำกัด"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addVariant}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
              >
                <Plus size={15} />
                เพิ่มตัวเลือก
              </button>
            </EditorSection>

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/95 p-3 shadow-xl backdrop-blur">
              <p className="text-xs text-slate-500">
                {form.id ? `Product ID: ${form.id}` : 'สินค้าจะได้รับ ID หลังบันทึก'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-xl border px-4 py-2 text-sm font-bold"
                >
                  ยกเลิก
                </button>
                <button
                  disabled={busy === 'save'}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-5 py-2 text-sm font-black text-white disabled:opacity-50"
                >
                  <Save size={16} />
                  {busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(280px,1fr)_180px_190px_140px_auto]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void load(1, perPage, query);
            }}
            className="flex gap-2"
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field-input"
              placeholder="ค้นหาชื่อ SKU หรือบาร์โค้ด"
            />
            <button
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-950 text-white"
              aria-label="ค้นหา"
            >
              <Search size={18} />
            </button>
          </form>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="field-input"
          >
            <option value="">ทุกสถานะ</option>
            <option value="active">ขายอยู่</option>
            <option value="hidden">ซ่อน</option>
            <option value="discontinued">เลิกขาย</option>
          </select>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="field-input"
          >
            <option value="">ทุกแบรนด์ในหน้านี้</option>
            {brands.map((brand) => (
              <option key={brand}>{brand}</option>
            ))}
          </select>
          <select
            value={perPage}
            onChange={(e) => {
              const value = Number(e.target.value);
              setPerPage(value);
              setPage(1);
              void load(1, value, query);
            }}
            className="field-input"
          >
            {[25, 50, 100, 200].map((value) => (
              <option key={value} value={value}>
                {value}/หน้า
              </option>
            ))}
          </select>
          <div className="flex items-center justify-end text-sm text-slate-500">
            ทั้งหมด {total.toLocaleString('th-TH')} รายการ
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50 p-3 text-sm">
            <strong>เลือก {selected.size} รายการ</strong>
            <button
              type="button"
              disabled={busy === 'bulk'}
              onClick={() => void bulkState('active')}
              className="rounded-lg border bg-white px-3 py-1.5 font-bold"
            >
              เปิดขาย
            </button>
            <button
              type="button"
              disabled={busy === 'bulk'}
              onClick={() => void bulkState('hidden')}
              className="rounded-lg border bg-white px-3 py-1.5 font-bold"
            >
              ซ่อน
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border bg-white px-3 py-1.5"
            >
              ล้าง
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                <th className="px-4 py-3">สินค้า</th>
                <th className="px-4 py-3">แบรนด์</th>
                <th className="px-4 py-3">หมวด</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">ราคา</th>
                <th className="px-4 py-3 text-right">คงเหลือ</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const oldPrice = Number(row.oldPrice || 0);
                const price = Number(row.price || 0);
                const stock = Number(row.stock || 0);
                return (
                  <tr key={row.id} className="border-t align-middle">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </td>
                    <td className="max-w-[340px] px-4 py-3">
                      <strong className="line-clamp-2" title={String(row.name || '')}>
                        {row.name || '—'}
                      </strong>
                      <div className="mt-1 flex gap-2 text-[10px] font-bold text-slate-400">
                        {row.home_featured && <span className="text-amber-700">★ แนะนำ</span>}
                        {row.model && <span>{row.model}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.brand || '—'}</td>
                    <td className="px-4 py-3">{row.category || '—'}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs">{row.sku || '—'}</code>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <strong>฿{money(price)}</strong>
                      {oldPrice > price && price >= 0 && (
                        <span className="mt-1 block text-[10px] text-rose-600">
                          <s>฿{money(oldPrice)}</s> · -{Math.round((1 - price / oldPrice) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-black ${stock <= 0 ? 'bg-rose-50 text-rose-700' : stock <= 5 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}
                      >
                        {money(stock)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${String(row.state || 'active') === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {row.state || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void openEdit(row)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs font-bold"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void toggleFeatured(row)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs font-bold"
                        >
                          {row.home_featured ? 'เลิกแนะนำ' : 'แนะนำ'}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void closeProduct(row)}
                          className="rounded-lg border px-2.5 py-1.5 text-xs font-bold text-rose-700"
                        >
                          ปิด
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleRows.length && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    ไม่พบสินค้าตามเงื่อนไข
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
          <span>
            หน้า {page.toLocaleString('th-TH')} / {pageCount.toLocaleString('th-TH')}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || busy === 'load'}
              onClick={() => {
                const next = Math.max(1, page - 1);
                setPage(next);
                void load(next);
              }}
              className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 font-bold disabled:opacity-40"
            >
              <ChevronLeft size={16} />
              ก่อนหน้า
            </button>
            <button
              type="button"
              disabled={page >= pageCount || busy === 'load'}
              onClick={() => {
                const next = Math.min(pageCount, page + 1);
                setPage(next);
                void load(next);
              }}
              className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 font-bold disabled:opacity-40"
            >
              ถัดไป
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <style
        jsx
        global
      >{`.field-input{height:44px;width:100%;border:1px solid rgb(226 232 240);border-radius:12px;background:white;padding:0 12px;font-size:14px;outline:none}.field-input:focus{border-color:rgb(5 150 105);box-shadow:0 0 0 3px rgb(16 185 129 / .12)}.field-input:disabled{background:rgb(248 250 252);color:rgb(100 116 139)}`}</style>
    </div>
  );
}

function EditorSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-black text-slate-900">{title}</h3>
          {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  setValue,
  step = '1',
  disabled = false,
}: {
  value: number;
  setValue: (value: number) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
      className="field-input"
    />
  );
}

function NullableNumberInput({
  value,
  setValue,
  placeholder = '',
}: {
  value: number | null;
  setValue: (value: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value ?? ''}
      onChange={(e) => setValue(e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
      className="field-input"
      placeholder={placeholder}
    />
  );
}
