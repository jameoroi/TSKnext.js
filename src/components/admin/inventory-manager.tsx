'use client';

import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { legacyRequest, LegacyApiError } from '@/lib/legacy-api.client';

type Row = Record<string, any>;
type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  address?: string;
  priority?: number;
  active?: boolean;
  is_default?: boolean;
};

type InventoryRow = {
  key: string;
  productId: string;
  productName: string;
  productState: string;
  variantId: string;
  variantLabel: string;
  sku: string;
  barcode: string;
  onHand: number | null;
  reserved: number;
  available: number | null;
  reorderPoint: number;
  warehouseId: string;
};

const toInt = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString('th-TH') : '—';

function apiCode(error: unknown) {
  return error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
}

function friendly(error: unknown) {
  const key = apiCode(error);
  const map: Record<string, string> = {
    invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    insufficient_stock: 'สต็อกพร้อมขายต้นทางไม่พอสำหรับการโอน',
    variant_not_found: 'ไม่พบรุ่นสินค้านี้ อาจมีการแก้ไขสินค้าไปแล้ว',
    inventory_adjust_failed: 'ปรับสต็อกไม่สำเร็จ กรุณารีเฟรชแล้วลองอีกครั้ง',
    unlimited_stock: 'รุ่นนี้ตั้งเป็นสต็อกไม่จำกัด จึงไม่สามารถปรับตัวเลขได้',
    warehouse_code_exists: 'รหัสคลังนี้ถูกใช้งานแล้ว',
    warehouse_in_use: 'ยังลบคลังนี้ไม่ได้ เพราะมีสินค้า/ยอดจองอยู่ในคลัง',
    default_warehouse_locked: 'คลังหลักไม่สามารถลบได้',
    forbidden_super_admin_only: 'รายการนี้ต้องใช้สิทธิ์ Super Admin',
    invalid_input: 'ข้อมูลไม่ครบหรือไม่ถูกต้อง',
  };
  return map[key] || key;
}

function rowsFor(products: Row[], warehouseId: string): InventoryRow[] {
  const result: InventoryRow[] = [];
  for (const product of products || []) {
    const variants = Array.isArray(product.variants) && product.variants.length
      ? product.variants
      : [{ id: 'default', label: 'แบบมาตรฐาน', sku: product.sku, barcode: product.barcode, inventory: { [warehouseId]: { on_hand: product.stock, reserved: product.reserved, reorder_point: product.low_stock_threshold } } }];
    for (const variant of variants) {
      const level = variant?.inventory?.[warehouseId] || { on_hand: 0, reserved: 0, reorder_point: product.low_stock_threshold ?? 5 };
      const onHand = level.on_hand === null ? null : toInt(level.on_hand);
      const reserved = onHand === null ? 0 : Math.min(toInt(level.reserved), onHand);
      result.push({
        key: `${product.id}:${variant.id || 'default'}:${warehouseId}`,
        productId: String(product.id),
        productName: String(product.name || product.sku || product.id),
        productState: String(product.state || 'active'),
        variantId: String(variant.id || 'default'),
        variantLabel: String(variant.label || variant.sku || 'แบบมาตรฐาน'),
        sku: String(variant.sku || product.sku || ''),
        barcode: String(variant.barcode || product.barcode || ''),
        onHand,
        reserved,
        available: onHand === null ? null : Math.max(0, onHand - reserved),
        reorderPoint: toInt(level.reorder_point ?? product.low_stock_threshold ?? 5),
        warehouseId,
      });
    }
  }
  return result;
}

export function InventoryManager({ initial, csrf, owner = false }: { initial: any; csrf: string; owner?: boolean }) {
  const [data, setData] = useState<any>(initial || { products: [], warehouses: [] });
  const [selectedWarehouse, setSelectedWarehouse] = useState(String(initial?.warehouses?.[0]?.id || 'main'));
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<Row[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [warehouseDraft, setWarehouseDraft] = useState<WarehouseRow>({ id: '', code: '', name: '', address: '', priority: 100, active: true });
  const [transferRow, setTransferRow] = useState<InventoryRow | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferQty, setTransferQty] = useState('1');
  const [transferReason, setTransferReason] = useState('warehouse_transfer');

  const warehouses: WarehouseRow[] = Array.isArray(data.warehouses) ? data.warehouses : [];
  const allRows = useMemo(() => rowsFor(data.products || [], selectedWarehouse), [data.products, selectedWarehouse]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allRows
      .filter((row) => !needle || `${row.productName} ${row.variantLabel} ${row.sku} ${row.barcode}`.toLowerCase().includes(needle))
      .filter((row) => !lowOnly || (row.available !== null && row.available <= row.reorderPoint))
      .sort((a, b) => {
        const av = a.available === null ? Number.MAX_SAFE_INTEGER : a.available;
        const bv = b.available === null ? Number.MAX_SAFE_INTEGER : b.available;
        return av - bv || a.productName.localeCompare(b.productName, 'th');
      });
  }, [allRows, lowOnly, query]);

  const metrics = useMemo(() => {
    let low = 0;
    let out = 0;
    let reserved = 0;
    let available = 0;
    for (const row of allRows) {
      reserved += row.reserved;
      if (row.available !== null) {
        available += row.available;
        if (row.available <= row.reorderPoint) low += 1;
        if (row.available <= 0) out += 1;
      }
    }
    return { low, out, reserved, available };
  }, [allRows]);

  function clearMessage() { setNotice(''); setError(''); }

  async function reload(serverQuery = '') {
    setBusy('reload'); clearMessage();
    try {
      const next = await legacyRequest<any>('admin.inventory.overview', { q: serverQuery, per_page: 200 });
      setData(next);
      setDraft({});
      if (!next.warehouses?.some((warehouse: Row) => String(warehouse.id) === selectedWarehouse)) {
        setSelectedWarehouse(String(next.warehouses?.[0]?.id || 'main'));
      }
    } catch (err) {
      setError(`โหลดคลังสินค้าไม่สำเร็จ: ${friendly(err)}`);
    } finally { setBusy(''); }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    await reload(query.trim());
  }

  async function adjust(row: InventoryRow) {
    const raw = draft[row.key] ?? String(row.onHand ?? '');
    const next = Number(raw);
    if (row.onHand === null) { setError('รุ่นนี้เป็นสต็อกไม่จำกัด'); return; }
    if (!Number.isFinite(next) || next < row.reserved || Math.floor(next) !== next) {
      setError(`จำนวนต้องเป็นจำนวนเต็มและไม่น้อยกว่ายอดจอง ${row.reserved}`);
      return;
    }
    if (next === row.onHand) return;
    setBusy(row.key); clearMessage();
    try {
      const result = await legacyRequest<any>('admin.inventory.adjust', {
        id: row.productId,
        variant_id: row.variantId,
        warehouse_id: row.warehouseId,
        set: next,
        reason: 'manual_adjust',
        csrf,
      }, 'POST');
      setData((current: any) => ({
        ...current,
        products: (current.products || []).map((product: Row) => String(product.id) === row.productId ? result.product : product),
      }));
      setDraft((current) => { const nextDraft = { ...current }; delete nextDraft[row.key]; return nextDraft; });
      setNotice(`ปรับ ${row.productName} · ${row.variantLabel} เป็น ${next.toLocaleString('th-TH')} แล้ว`);
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  function openTransfer(row: InventoryRow) {
    const target = warehouses.find((warehouse) => warehouse.active !== false && warehouse.id !== row.warehouseId);
    setTransferRow(row);
    setTransferTo(String(target?.id || ''));
    setTransferQty('1');
    setTransferReason('warehouse_transfer');
    clearMessage();
  }

  async function transfer() {
    if (!transferRow) return;
    const qty = Math.floor(Number(transferQty));
    if (!transferTo || transferTo === transferRow.warehouseId || !Number.isFinite(qty) || qty < 1) {
      setError('กรุณาเลือกคลังปลายทางและจำนวนที่ถูกต้อง');
      return;
    }
    setBusy('transfer'); clearMessage();
    try {
      const result = await legacyRequest<any>('admin.inventory.transfer', {
        id: transferRow.productId,
        variant_id: transferRow.variantId,
        from_warehouse_id: transferRow.warehouseId,
        to_warehouse_id: transferTo,
        qty,
        reason: transferReason.trim() || 'warehouse_transfer',
        csrf,
      }, 'POST');
      setData((current: any) => ({
        ...current,
        products: (current.products || []).map((product: Row) => String(product.id) === transferRow.productId ? result.product : product),
      }));
      setNotice(`โอน ${transferRow.variantLabel} จำนวน ${qty.toLocaleString('th-TH')} ชิ้นแล้ว · Transfer ${result.transfer_id || ''}`);
      setTransferRow(null);
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  async function openLogs(row?: InventoryRow) {
    setBusy('logs'); clearMessage();
    try {
      const result = await legacyRequest<any>('admin.inventory.logs', {
        product_id: row?.productId,
        variant_id: row?.variantId,
        warehouse_id: selectedWarehouse,
      });
      setLogs(result.logs || []);
      setLogsOpen(true);
    } catch (err) { setError(`โหลดประวัติไม่สำเร็จ: ${friendly(err)}`); }
    finally { setBusy(''); }
  }

  function newWarehouse() {
    setWarehouseDraft({ id: '', code: '', name: '', address: '', priority: Math.max(2, warehouses.length + 1), active: true });
    setWarehouseOpen(true); clearMessage();
  }

  function editWarehouse(warehouse: WarehouseRow) {
    setWarehouseDraft({ ...warehouse, address: warehouse.address || '', priority: warehouse.priority || 100, active: warehouse.active !== false });
    setWarehouseOpen(true); clearMessage();
  }

  async function saveWarehouse() {
    if (!warehouseDraft.code.trim() || !warehouseDraft.name.trim()) {
      setError('กรุณากรอกรหัสคลังและชื่อคลัง'); return;
    }
    setBusy('warehouse-save'); clearMessage();
    try {
      await legacyRequest('admin.warehouses.save', {
        ...warehouseDraft,
        code: warehouseDraft.code.trim().toUpperCase(),
        name: warehouseDraft.name.trim(),
        priority: Math.max(1, toInt(warehouseDraft.priority) || 1),
        csrf,
      }, 'POST');
      setWarehouseOpen(false);
      setNotice('บันทึกคลังสินค้าแล้ว');
      await reload(query.trim());
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  async function deleteWarehouse(warehouse: WarehouseRow) {
    if (warehouse.is_default) return;
    if (!window.confirm(`ลบคลัง “${warehouse.name}” ? ระบบจะปฏิเสธหากยังมีสต็อกหรือยอดจองอยู่`)) return;
    setBusy(`warehouse:${warehouse.id}`); clearMessage();
    try {
      await legacyRequest('admin.warehouses.delete', { id: warehouse.id, csrf }, 'POST');
      setNotice('ลบคลังสินค้าแล้ว');
      await reload(query.trim());
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  async function migrateLegacyInventory() {
    if (!owner) return;
    const confirmed = window.confirm('Normalize โครงสร้างคลังของสินค้าทั้งหมด? การทำงานนี้เป็น one-way maintenance สำหรับข้อมูลเก่าและจะถูกบันทึกใน Audit Log');
    if (!confirmed) return;
    setBusy('inventory-migrate'); clearMessage();
    try {
      const result = await legacyRequest<any>('admin.inventory.migrate', { csrf }, 'POST');
      setNotice(`Normalize inventory สำเร็จ ${Number(result.migrated || 0).toLocaleString('th-TH')} สินค้า`);
      await reload(query.trim());
    } catch (err) {
      setError(`Normalize inventory ไม่สำเร็จ: ${friendly(err)}`);
    } finally { setBusy(''); }
  }

  const currentWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouse);
  const otherWarehouses = warehouses.filter((warehouse) => warehouse.id !== selectedWarehouse && warehouse.active !== false);

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="พร้อมขาย" value={metrics.available.toLocaleString('th-TH')} note={`คลัง ${currentWarehouse?.name || selectedWarehouse}`} />
      <Metric label="ถูกจอง" value={metrics.reserved.toLocaleString('th-TH')} note="ยังไม่หักออกจาก on-hand" />
      <Metric label="ใกล้หมด" value={metrics.low.toLocaleString('th-TH')} note="ต่ำกว่า reorder point" warning={metrics.low > 0} />
      <Metric label="หมดสต็อก" value={metrics.out.toLocaleString('th-TH')} note="available = 0" danger={metrics.out > 0} />
    </div>

    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}

    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Warehouse size={18} className="text-emerald-700"/><div><h2 className="font-black">Multi-Warehouse Inventory</h2><p className="text-xs text-slate-500">นับสต็อกระดับ Variant × Warehouse พร้อมยอดจองและ available</p></div></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void openLogs()} disabled={busy === 'logs'} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><ClipboardList size={14}/>ประวัติคลัง</button>
          <button type="button" onClick={newWarehouse} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><Plus size={14}/>เพิ่มคลัง</button>
          {owner && <button type="button" onClick={() => void migrateLegacyInventory()} disabled={busy === 'inventory-migrate'} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900" title="One-way maintenance สำหรับ normalize inventory schema ของข้อมูลเก่า"><RefreshCcw size={14} className={busy === 'inventory-migrate' ? 'animate-spin' : ''}/>Normalize ข้อมูลเก่า</button>}
          <button type="button" onClick={() => void reload(query.trim())} disabled={busy === 'reload'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-3 py-2 text-xs font-black text-white"><RefreshCcw size={14} className={busy === 'reload' ? 'animate-spin' : ''}/>รีเฟรช</button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {warehouses.map((warehouse) => <div key={warehouse.id} className={`flex items-center gap-1 rounded-xl border p-1 ${selectedWarehouse === warehouse.id ? 'border-emerald-700 bg-emerald-50' : 'bg-white'}`}>
          <button type="button" onClick={() => { setSelectedWarehouse(warehouse.id); setDraft({}); }} className="rounded-lg px-3 py-2 text-xs font-black">
            {warehouse.code} · {warehouse.name}{warehouse.active === false ? ' (ปิด)' : ''}
          </button>
          <button type="button" title="แก้ไขคลัง" onClick={() => editWarehouse(warehouse)} className="rounded-lg p-2 text-slate-500 hover:bg-white"><PencilLine size={13}/></button>
        </div>)}
      </div>

      <form onSubmit={submitSearch} className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3">
        <label className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm" placeholder="ค้นหาชื่อสินค้า / SKU / Barcode"/></label>
        <label className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold"><input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)}/>เฉพาะใกล้หมด</label>
        <button className="h-10 rounded-xl border bg-white px-4 text-xs font-black" disabled={busy === 'reload'}>ค้นหา</button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">สินค้า / รุ่น</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reserved</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Reorder</th><th className="px-4 py-3">ปรับเป็น</th><th className="px-4 py-3">จัดการ</th></tr></thead>
          <tbody>{visibleRows.map((row) => {
            const low = row.available !== null && row.available <= row.reorderPoint;
            const out = row.available !== null && row.available <= 0;
            return <tr key={row.key} className={`border-t align-middle ${out ? 'bg-rose-50/40' : low ? 'bg-amber-50/40' : ''}`}>
              <td className="px-4 py-3"><p className="font-black text-slate-900">{row.productName}</p><p className="mt-1 text-xs text-slate-500">{row.variantLabel} · <span className="uppercase">{row.productState}</span></p></td>
              <td className="px-4 py-3"><code className="text-xs">{row.sku || '—'}</code>{row.barcode && <p className="mt-1 text-[10px] text-slate-400">{row.barcode}</p>}</td>
              <td className="px-4 py-3 text-right font-black">{row.onHand === null ? '∞' : row.onHand.toLocaleString('th-TH')}</td>
              <td className="px-4 py-3 text-right text-amber-700">{row.reserved.toLocaleString('th-TH')}</td>
              <td className={`px-4 py-3 text-right font-black ${out ? 'text-rose-700' : low ? 'text-amber-700' : 'text-emerald-700'}`}>{row.available === null ? '∞' : row.available.toLocaleString('th-TH')}</td>
              <td className="px-4 py-3 text-right text-slate-500">{row.reorderPoint.toLocaleString('th-TH')}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><input type="number" min={row.reserved} step="1" disabled={row.onHand === null || busy === row.key} value={draft[row.key] ?? (row.onHand === null ? '' : String(row.onHand))} onChange={(event) => setDraft((current) => ({ ...current, [row.key]: event.target.value }))} className="h-9 w-24 rounded-lg border bg-white px-2 text-right text-sm disabled:bg-slate-100"/><button type="button" disabled={row.onHand === null || busy === row.key || (draft[row.key] ?? String(row.onHand ?? '')) === String(row.onHand ?? '')} onClick={() => void adjust(row)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-950 px-2.5 text-xs font-black text-white disabled:opacity-40"><Save size={13}/>บันทึก</button></div></td>
              <td className="px-4 py-3"><div className="flex gap-1"><button type="button" disabled={!otherWarehouses.length || row.available === null || row.available < 1} onClick={() => openTransfer(row)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold disabled:opacity-40"><ArrowLeftRight size={13}/>โอน</button><button type="button" onClick={() => void openLogs(row)} className="rounded-lg border p-2" title="ประวัติรุ่นนี้"><ClipboardList size={14}/></button></div></td>
            </tr>;
          })}{!visibleRows.length && <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-slate-400">ไม่พบสินค้าตามเงื่อนไข</td></tr>}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">ระบบไม่อนุญาตให้ปรับ On hand ต่ำกว่ายอด Reserved เพื่อป้องกันออเดอร์ที่จองสต็อกไว้แล้วเสียหาย และการโอนคลังใช้ Available เป็นเพดาน</p>
    </section>

    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Boxes size={17} className="text-emerald-700"/><div><h2 className="font-black">คลังสินค้า</h2><p className="text-xs text-slate-500">เปิด/ปิดคลัง กำหนดลำดับ และที่อยู่</p></div></div><span className="text-xs font-bold text-slate-500">{warehouses.length} คลัง</span></div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{warehouses.map((warehouse) => <article key={warehouse.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong>{warehouse.code}</strong>{warehouse.is_default && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">DEFAULT</span>}{warehouse.active === false && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black">ปิดใช้งาน</span>}</div><p className="mt-1 text-sm font-bold">{warehouse.name}</p><p className="mt-2 text-xs leading-5 text-slate-500">{warehouse.address || 'ยังไม่ได้ระบุที่อยู่'}<br/>Priority {warehouse.priority || '—'}</p></div><div className="flex gap-1"><button type="button" onClick={() => editWarehouse(warehouse)} className="rounded-lg border p-2" title="แก้ไข"><PencilLine size={14}/></button>{!warehouse.is_default && <button type="button" disabled={busy === `warehouse:${warehouse.id}`} onClick={() => void deleteWarehouse(warehouse)} className="rounded-lg border p-2 text-rose-700" title="ลบ"><Trash2 size={14}/></button>}</div></div></article>)}</div>
    </section>

    {transferRow && <Modal title="โอนสต็อกระหว่างคลัง" onClose={() => setTransferRow(null)}>
      <div className="space-y-4"><div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{transferRow.productName}</strong><p className="mt-1 text-xs text-slate-500">{transferRow.variantLabel} · {transferRow.sku || 'ไม่มี SKU'} · พร้อมโอนสูงสุด {transferRow.available?.toLocaleString('th-TH') || 0}</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">จากคลัง<input readOnly value={currentWarehouse?.name || selectedWarehouse} className="mt-1 h-10 w-full rounded-xl border bg-slate-100 px-3 font-normal"/></label><label className="text-xs font-bold text-slate-600">ไปคลัง<select value={transferTo} onChange={(event) => setTransferTo(event.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 font-normal"><option value="">เลือกคลัง</option>{otherWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label className="text-xs font-bold text-slate-600">จำนวน<input type="number" min="1" max={transferRow.available ?? undefined} value={transferQty} onChange={(event) => setTransferQty(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"/></label><label className="text-xs font-bold text-slate-600">เหตุผล<input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"/></label></div><button type="button" disabled={busy === 'transfer'} onClick={() => void transfer()} className="w-full rounded-xl bg-emerald-950 px-4 py-3 text-sm font-black text-white">{busy === 'transfer' ? 'กำลังโอน…' : 'ยืนยันการโอน'}</button></div>
    </Modal>}

    {warehouseOpen && <Modal title={warehouseDraft.id ? 'แก้ไขคลังสินค้า' : 'เพิ่มคลังสินค้า'} onClose={() => setWarehouseOpen(false)}>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">รหัสคลัง<input value={warehouseDraft.code} disabled={warehouseDraft.is_default} maxLength={40} onChange={(event) => setWarehouseDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal uppercase disabled:bg-slate-100" placeholder="BKK01"/></label><label className="text-xs font-bold text-slate-600">ชื่อคลัง<input value={warehouseDraft.name} maxLength={160} onChange={(event) => setWarehouseDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"/></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">ที่อยู่<textarea value={warehouseDraft.address || ''} maxLength={500} onChange={(event) => setWarehouseDraft((current) => ({ ...current, address: event.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border p-3 font-normal"/></label><label className="text-xs font-bold text-slate-600">Priority<input type="number" min="1" max="999" value={warehouseDraft.priority || 1} onChange={(event) => setWarehouseDraft((current) => ({ ...current, priority: Number(event.target.value) }))} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"/></label><label className="flex items-end"><span className="flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-xs font-bold"><input type="checkbox" checked={warehouseDraft.active !== false} onChange={(event) => setWarehouseDraft((current) => ({ ...current, active: event.target.checked }))}/>เปิดใช้งานคลัง</span></label></div><button type="button" disabled={busy === 'warehouse-save'} onClick={() => void saveWarehouse()} className="mt-4 w-full rounded-xl bg-emerald-950 px-4 py-3 text-sm font-black text-white">{busy === 'warehouse-save' ? 'กำลังบันทึก…' : 'บันทึกคลัง'}</button>
    </Modal>}

    {logsOpen && <Modal title="Inventory Ledger" onClose={() => setLogsOpen(false)} wide>
      <div className="max-h-[65vh] overflow-auto rounded-xl border"><table className="w-full min-w-[900px] text-xs"><thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">เวลา</th><th className="px-3 py-2">SKU / Variant</th><th className="px-3 py-2">Warehouse</th><th className="px-3 py-2 text-right">ก่อน</th><th className="px-3 py-2 text-right">Δ</th><th className="px-3 py-2 text-right">หลัง</th><th className="px-3 py-2">เหตุผล</th><th className="px-3 py-2">อ้างอิง</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t"><td className="whitespace-nowrap px-3 py-2">{dateTime(log.at)}</td><td className="px-3 py-2"><code>{log.sku || '—'}</code><div className="text-[10px] text-slate-400">{log.variant_id || 'default'}</div></td><td className="px-3 py-2">{warehouses.find((warehouse) => warehouse.id === log.warehouse_id)?.code || log.warehouse_id || '—'}</td><td className="px-3 py-2 text-right">{log.before ?? '—'}</td><td className={`px-3 py-2 text-right font-black ${Number(log.delta) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{Number(log.delta) > 0 ? '+' : ''}{log.delta ?? 0}</td><td className="px-3 py-2 text-right">{log.after ?? '—'}</td><td className="px-3 py-2">{log.reason || '—'}</td><td className="px-3 py-2 text-[10px] text-slate-500">{log.order_no || log.transfer_id || log.admin || '—'}</td></tr>)}{!logs.length && <tr><td colSpan={8} className="p-10 text-center text-slate-400">ยังไม่มีประวัติ</td></tr>}</tbody></table></div>
    </Modal>}
  </div>;
}

function Metric({ label, value, note, warning, danger }: { label: string; value: string; note: string; warning?: boolean; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-4 shadow-sm ${danger ? 'border-rose-200' : warning ? 'border-amber-200' : ''}`}><p className="text-xs font-bold text-slate-500">{label}</p><p className={`mt-2 text-2xl font-black ${danger ? 'text-rose-700' : warning ? 'text-amber-700' : 'text-slate-950'}`}>{value}</p><p className="mt-1 text-[10px] text-slate-400">{note}</p></div>;
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`max-h-[90vh] w-full overflow-auto rounded-3xl bg-white p-5 shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}><header className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-black">{title}</h2><button type="button" onClick={onClose} className="rounded-xl border p-2"><X size={16}/></button></header>{children}</section></div>;
}
