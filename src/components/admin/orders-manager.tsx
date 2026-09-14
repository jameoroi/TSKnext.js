'use client';

import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  PackageCheck,
  Printer,
  RefreshCcw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { CARRIERS, carrierName, findCarrier } from '@/shared/carriers';
import { canMoveTo, whyBlocked } from '@/shared/order-status';

type Row = Record<string, any>;

type StatusDef = { value: string; label: string };
const STATUSES: StatusDef[] = [
  { value: 'new', label: 'ใหม่' },
  { value: 'awaiting_verification', label: 'รอตรวจสลิป' },
  { value: 'paid', label: 'ชำระแล้ว' },
  { value: 'processing', label: 'กำลังจัดเตรียม' },
  { value: 'packing', label: 'กำลังแพ็ก' },
  { value: 'shipped', label: 'จัดส่งแล้ว' },
  { value: 'completed', label: 'สำเร็จ' },
  { value: 'cancelled', label: 'ยกเลิก' },
  { value: 'refunded', label: 'คืนเงินแล้ว' },
  { value: 'expired', label: 'หมดอายุ' },
];
const OPEN = new Set(['new', 'awaiting_verification', 'paid', 'processing', 'packing']);
const label = (value: string) => STATUSES.find((status) => status.value === value)?.label || value || '—';
const baht = (value: unknown) =>
  `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const when = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function friendly(error: unknown) {
  const key =
    error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const messages: Record<string, string> = {
    invalid_order_transition: 'เปลี่ยนสถานะนี้ไม่ได้จากสถานะปัจจุบัน',
    invalid_status: 'สถานะไม่ถูกต้อง',
    invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    unauthorized: 'ไม่มีสิทธิ์ใช้งานส่วนนี้',
    not_found: 'ไม่พบคำสั่งซื้อหรือสลิปนี้',
    order_state_locked: 'ออเดอร์ผ่านขั้นตอนนี้ไปแล้ว จึงตรวจสลิปซ้ำไม่ได้',
    payment_not_verified: 'ยังยืนยันการชำระเงินไม่ได้ จึงปิดออเดอร์ไม่ได้',
  };
  return messages[key] || key;
}

function statusTone(status: string) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700';
  if (['cancelled', 'refunded', 'expired'].includes(status)) return 'bg-slate-100 text-slate-600';
  if (status === 'shipped') return 'bg-blue-50 text-blue-700';
  if (status === 'paid') return 'bg-cyan-50 text-cyan-700';
  return 'bg-amber-50 text-amber-800';
}

export function OrdersManager({
  initialRows,
  initialSlips,
  csrf,
  initialSource = 'commerce',
}: {
  initialRows: Row[];
  initialSlips: Row[];
  csrf: string;
  initialSource?: string;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows || []);
  const [dataSource, setDataSource] = useState(initialSource);
  const [slips, setSlips] = useState<Row[]>(initialSlips || []);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tracking, setTracking] = useState<Record<string, { carrier: string; tracking_number: string }>>({});

  const pendingSlips = useMemo(
    () =>
      slips.filter((slip) => {
        const status = String(slip?.status || '').toLowerCase();
        return status ? status === 'pending' : !slip?.reviewed_at;
      }),
    [slips],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = { open: 0 };
    for (const order of rows) {
      const status = String(order.status || '');
      out[status] = (out[status] || 0) + 1;
      if (OPEN.has(status)) out.open += 1;
    }
    return out;
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((order) => {
        const status = String(order.status || '');
        if (statusFilter === 'open' && !OPEN.has(status)) return false;
        if (statusFilter !== 'open' && statusFilter && status !== statusFilter) return false;
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return [
          order.order_no,
          order.name,
          order.customer_name,
          order.phone,
          order.email,
          order.tracking_number,
          order.carrier,
        ].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(needle),
        );
      }),
    [query, rows, statusFilter],
  );

  const allVisiblePicked = filtered.length > 0 && filtered.every((order) => picked.has(String(order.id)));
  const revenueOpen = rows
    .filter((row) => OPEN.has(String(row.status || '')))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);

  function clearMessage() {
    setNotice('');
    setError('');
  }

  async function reload() {
    setBusy('reload');
    clearMessage();
    try {
      const [orderData, slipData] = await Promise.all([
        legacyRequest<any>('admin.orders.list'),
        legacyRequest<any>('admin.slips.list'),
      ]);
      setRows(orderData.orders || []);
      setDataSource(String(orderData.source || 'commerce'));
      setSlips(slipData.slips || []);
    } catch (err) {
      setError(`รีเฟรชไม่สำเร็จ: ${friendly(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function setStatus(order: Row, status: string) {
    if (!canMoveTo(order, status)) {
      setError(whyBlocked(order, status));
      return;
    }
    if (
      ['cancelled', 'refunded'].includes(status) &&
      !window.confirm(
        `${label(status)} ออเดอร์ ${order.order_no || order.id} ? ระบบจะคืน/ปล่อยสต็อกตามสถานะปัจจุบัน`,
      )
    )
      return;
    setBusy(`status:${order.id}`);
    clearMessage();
    try {
      const result = await legacyRequest<any>('admin.order.status', { id: order.id, status, csrf }, 'POST');
      setRows((current) =>
        current.map((item) => (String(item.id) === String(order.id) ? result.order : item)),
      );
      setNotice(`ออเดอร์ ${order.order_no || order.id} → ${label(status)} แล้ว`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  function trackingFor(order: Row) {
    return (
      tracking[String(order.id)] || {
        carrier: String(order.carrier || ''),
        tracking_number: String(order.tracking_number || ''),
      }
    );
  }

  function patchTracking(order: Row, patch: Partial<{ carrier: string; tracking_number: string }>) {
    const id = String(order.id);
    setTracking((current) => ({ ...current, [id]: { ...trackingFor(order), ...current[id], ...patch } }));
  }

  async function saveTracking(order: Row) {
    const entry = trackingFor(order);
    if (!entry.tracking_number.trim()) {
      setError('กรุณากรอกเลขพัสดุ');
      return;
    }
    setBusy(`tracking:${order.id}`);
    clearMessage();
    try {
      const result = await legacyRequest<any>(
        'admin.order.shipping',
        { id: order.id, carrier: entry.carrier, tracking_number: entry.tracking_number.trim(), csrf },
        'POST',
      );
      setRows((current) =>
        current.map((item) => (String(item.id) === String(order.id) ? result.order : item)),
      );
      setNotice(`บันทึกเลขพัสดุ ${entry.tracking_number.trim()} แล้ว`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function verifySlip(slip: Row, approve: boolean) {
    if (!approve && !window.confirm(`ปฏิเสธสลิปของออเดอร์ ${slip.order_no || ''} ?`)) return;
    setBusy(`slip:${slip.id}`);
    clearMessage();
    try {
      await legacyRequest('admin.slip.verify', { id: slip.id, approve, csrf }, 'POST');
      setNotice(approve ? 'อนุมัติสลิปและยืนยันการชำระเงินแล้ว' : 'ปฏิเสธสลิปแล้ว');
      await reload();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  function togglePick(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setPicked((current) => {
      if (allVisiblePicked)
        return new Set([...current].filter((id) => !filtered.some((order) => String(order.id) === id)));
      const next = new Set(current);
      filtered.forEach((order) => next.add(String(order.id)));
      return next;
    });
  }

  function printPicked() {
    if (!picked.size) return;
    window.location.href = `/admin/purchase-order?orders=${encodeURIComponent([...picked].join(','))}`;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="ต้องดำเนินการ"
          value={String(counts.open || 0)}
          note={baht(revenueOpen)}
          warning={Boolean(counts.open)}
        />
        <Metric
          label="รอตรวจสลิป"
          value={String(pendingSlips.length)}
          note="ตรวจเงินเข้าก่อนแพ็กสินค้า"
          danger={pendingSlips.length > 0}
        />
        <Metric label="จัดส่งแล้ว" value={String(counts.shipped || 0)} note="รอลูกค้ารับสินค้า" />
        <Metric
          label="สำเร็จ"
          value={String(counts.completed || 0)}
          note={`ทั้งหมด ${rows.length.toLocaleString('th-TH')} ออเดอร์`}
        />
      </div>

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      )}

      {pendingSlips.length > 0 && (
        <section className="rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <ClipboardCheck size={18} />
              </span>
              <div>
                <h2 className="font-black">สลิปรอตรวจสอบ</h2>
                <p className="text-xs text-slate-500">เงินเข้าที่รอมนุษย์ยืนยันควรถูกจัดการก่อนคิวอื่น</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-950 px-3 py-1.5 text-xs font-black text-white">
              {pendingSlips.length}
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {pendingSlips.map((slip) => (
              <article
                key={slip.id}
                className="grid gap-3 rounded-2xl border p-3 sm:grid-cols-[110px_1fr_auto]"
              >
                <div className="overflow-hidden rounded-xl bg-slate-100">
                  {slip.image_data_url ? (
                    <a href={slip.image_data_url} target="_blank" rel="noreferrer">
                      <img
                        src={slip.image_data_url}
                        alt={`สลิป ${slip.order_no || ''}`}
                        className="h-28 w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="grid h-28 place-items-center text-xs text-slate-400">ไม่มีรูป</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-black">{slip.order_no || slip.order_id || '—'}</p>
                  <p className="mt-1 text-xs text-slate-500">แจ้งเมื่อ {when(slip.created_at)}</p>
                  {slip.note && (
                    <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                      {slip.note}
                    </p>
                  )}
                  {slip.verification_provider && (
                    <p className="mt-2 text-[10px] text-slate-400">Provider: {slip.verification_provider}</p>
                  )}
                </div>
                <div className="flex gap-2 sm:flex-col">
                  <button
                    type="button"
                    disabled={busy === `slip:${slip.id}`}
                    onClick={() => void verifySlip(slip, true)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-950 px-3 py-2 text-xs font-black text-white"
                  >
                    <Check size={14} />
                    อนุมัติ
                  </button>
                  <button
                    type="button"
                    disabled={busy === `slip:${slip.id}`}
                    onClick={() => void verifySlip(slip, false)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-black text-rose-700"
                  >
                    <X size={14} />
                    ปฏิเสธ
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black">Order Operations</h2>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-black ${dataSource === 'relational' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
              >
                {dataSource === 'relational' ? 'PostgreSQL relational' : 'Commerce compatibility'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              สถานะ · Payment · Fulfillment · Tracking · Supplier paperwork
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!picked.size}
              onClick={printPicked}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40"
            >
              <Printer size={14} />
              พิมพ์ใบสั่งซื้อ{picked.size ? ` (${picked.size})` : ''}
            </button>
            <button
              type="button"
              disabled={busy === 'reload'}
              onClick={() => void reload()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-3 py-2 text-xs font-black text-white"
            >
              <RefreshCcw size={14} className={busy === 'reload' ? 'animate-spin' : ''} />
              รีเฟรช
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b bg-slate-50 p-3">
          <label className="relative min-w-[260px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm"
              placeholder="เลขออเดอร์ / ลูกค้า / เบอร์โทร / Tracking"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-xl border bg-white px-3 text-sm font-bold"
          >
            <option value="open">ที่ต้องดำเนินการ ({counts.open || 0})</option>
            <option value="">ทุกสถานะ ({rows.length})</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label} ({counts[status.value] || 0})
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-white text-left text-xs text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisiblePicked}
                    onChange={toggleVisible}
                    aria-label="เลือกออเดอร์ที่เห็นทั้งหมด"
                  />
                </th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">ลูกค้า</th>
                <th className="px-4 py-3 text-right">ยอดรวม</th>
                <th className="px-4 py-3">ชำระเงิน</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">ขนส่ง</th>
                <th className="px-4 py-3">สั่งเมื่อ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const id = String(order.id);
                const isExpanded = expanded === id;
                const shipping = trackingFor(order);
                return (
                  <OrdersRows
                    key={id}
                    order={order}
                    id={id}
                    picked={picked.has(id)}
                    isExpanded={isExpanded}
                    busy={busy}
                    shipping={shipping}
                    csrf={csrf}
                    onTogglePick={() => togglePick(id)}
                    onExpand={() => setExpanded(isExpanded ? '' : id)}
                    onStatus={(status) => void setStatus(order, status)}
                    onTracking={(patch) => patchTracking(order, patch)}
                    onSaveTracking={() => void saveTracking(order)}
                  />
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-slate-400">
                    ไม่มีคำสั่งซื้อตามเงื่อนไข
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function OrdersRows({
  order,
  id,
  picked,
  isExpanded,
  busy,
  shipping,
  onTogglePick,
  onExpand,
  onStatus,
  onTracking,
  onSaveTracking,
}: {
  order: Row;
  id: string;
  picked: boolean;
  isExpanded: boolean;
  busy: string;
  shipping: { carrier: string; tracking_number: string };
  csrf: string;
  onTogglePick: () => void;
  onExpand: () => void;
  onStatus: (status: string) => void;
  onTracking: (patch: Partial<{ carrier: string; tracking_number: string }>) => void;
  onSaveTracking: () => void;
}) {
  const knownCarrier = findCarrier(shipping.carrier);
  return (
    <>
      <tr className="border-t align-top">
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={picked}
            onChange={onTogglePick}
            aria-label={`เลือก ${order.order_no || id}`}
          />
        </td>
        <td className="px-4 py-3">
          <p className="font-black">{order.order_no || id}</p>
          {order.agent_store_name && (
            <p className="mt-1 text-[10px] text-violet-600">Agent: {order.agent_store_name}</p>
          )}
        </td>
        <td className="px-4 py-3">
          <p className="font-bold">{order.name || order.customer_name || '—'}</p>
          <p className="mt-1 text-xs text-slate-400">{order.phone || order.email || ''}</p>
        </td>
        <td className="px-4 py-3 text-right font-black">{baht(order.total)}</td>
        <td className="px-4 py-3">
          <p className="text-xs font-bold">{order.payment_method || '—'}</p>
          <p className="mt-1 text-[10px] text-slate-400">{order.payment_status || ''}</p>
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone(String(order.status || ''))}`}
          >
            {label(String(order.status || ''))}
          </span>
        </td>
        <td className="px-4 py-3">
          <p className="text-xs font-bold">{carrierName(order.carrier) || '—'}</p>
          <p className="mt-1 text-[10px] text-slate-500">{order.tracking_number || ''}</p>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{when(order.created_at)}</td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold"
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}จัดการ
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-t bg-slate-50/70">
          <td colSpan={9} className="p-4">
            <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
              <section className="rounded-2xl border bg-white p-4">
                <h3 className="font-black">รายการสินค้าและจัดส่ง</h3>
                <div className="mt-3 divide-y rounded-xl border">
                  {(order.items || []).map((item: Row, index: number) => (
                    <div
                      key={`${item.id || item.sku || index}-${index}`}
                      className="flex justify-between gap-4 p-3 text-xs"
                    >
                      <div>
                        <strong>{item.name || 'สินค้า'}</strong>
                        {item.variant_label && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            {item.variant_label} · {item.sku || ''}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap">
                        {Number(item.qty || 0).toLocaleString('th-TH')} × {baht(item.price)}
                      </span>
                    </div>
                  ))}
                  {!(order.items || []).length && <p className="p-4 text-xs text-slate-400">ไม่มีรายการสินค้า</p>}
                </div>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <strong>ที่อยู่จัดส่ง</strong>
                  <br />
                  {order.address || order.shipping_address || '—'} {order.district || ''}{' '}
                  {order.province || ''} {order.zip || order.postcode || ''}
                  {order.note && (
                    <>
                      <br />
                      <strong>หมายเหตุ:</strong> {order.note}
                    </>
                  )}
                </div>
                {order.agent_commission && (
                  <div className="mt-3 rounded-xl bg-violet-50 p-3 text-xs text-violet-800">
                    ค่าคอมตัวแทน {baht(order.agent_commission.amount)} · {order.agent_commission.status || '—'}
                  </div>
                )}
              </section>
              <section className="space-y-4 rounded-2xl border bg-white p-4">
                <div>
                  <h3 className="font-black">เปลี่ยนสถานะ</h3>
                  <p className="mt-1 text-xs text-slate-500">{whyBlocked(order)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STATUSES.map((status) => {
                      const current = String(order.status || '') === status.value;
                      const allowed = canMoveTo(order, status.value);
                      return (
                        <button
                          key={status.value}
                          type="button"
                          disabled={current || !allowed || busy === `status:${id}`}
                          title={!allowed ? whyBlocked(order, status.value) : ''}
                          onClick={() => onStatus(status.value)}
                          className={`rounded-xl px-3 py-2 text-xs font-black ${current ? 'bg-emerald-950 text-white' : 'border bg-white'} disabled:opacity-35`}
                        >
                          {status.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-emerald-700" />
                    <h3 className="font-black">เลขพัสดุ</h3>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-600">
                      ขนส่ง
                      <select
                        value={shipping.carrier}
                        onChange={(event) => onTracking({ carrier: event.target.value })}
                        className="mt-1 h-10 w-full rounded-xl border bg-white px-3 font-normal"
                      >
                        <option value="">— เลือกขนส่ง —</option>
                        {CARRIERS.map((carrier) => (
                          <option key={carrier.id} value={carrier.id}>
                            {carrier.name}
                          </option>
                        ))}
                        {shipping.carrier && !knownCarrier && (
                          <option value={shipping.carrier}>{shipping.carrier} (เดิม)</option>
                        )}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      เลขพัสดุ
                      <input
                        value={shipping.tracking_number}
                        onChange={(event) => onTracking({ tracking_number: event.target.value })}
                        className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"
                        placeholder="Tracking number"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy === `tracking:${id}` || !shipping.tracking_number.trim()}
                    onClick={onSaveTracking}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                  >
                    <PackageCheck size={14} />
                    บันทึกเลขพัสดุ
                  </button>
                </div>
                {Array.isArray(order.status_history) && order.status_history.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-black">Status History</h3>
                    <div className="mt-2 max-h-36 space-y-1 overflow-auto">
                      {[...order.status_history].reverse().map((history: Row, index: number) => (
                        <div
                          key={`${history.at || index}-${index}`}
                          className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[10px]"
                        >
                          <strong>{label(String(history.status || ''))}</strong>
                          <span className="text-slate-500">
                            {when(history.at)} · {history.by || 'system'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Metric({
  label: metricLabel,
  value,
  note,
  warning,
  danger,
}: {
  label: string;
  value: string;
  note: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${danger ? 'border-rose-200' : warning ? 'border-amber-200' : ''}`}
    >
      <p className="text-xs font-bold text-slate-500">{metricLabel}</p>
      <p
        className={`mt-2 text-2xl font-black ${danger ? 'text-rose-700' : warning ? 'text-amber-700' : 'text-slate-950'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </div>
  );
}
