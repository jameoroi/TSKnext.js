'use client';

import { Boxes, CircleDollarSign, KeyRound, PackageCheck, RefreshCcw, Truck } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { CARRIERS, carrierName } from '@/shared/carriers';

type Row = Record<string, any>;
const baht = (value: unknown) =>
  `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const when = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function friendly(error: unknown) {
  const key =
    error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const messages: Record<string, string> = {
    unauthorized: 'เซสชันหมดอายุหรือไม่มีสิทธิ์ Supplier',
    forbidden: 'ออเดอร์นี้ไม่ได้อยู่ในความรับผิดชอบของ Supplier นี้',
    order_not_found: 'ไม่พบออเดอร์',
    tracking_required: 'กรุณากรอกเลขพัสดุ',
    invalid_password: 'รหัสผ่านเดิมไม่ถูกต้อง',
    weak_password: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร',
  };
  return messages[key] || key;
}

export function SupplierDashboard({ data: initialData, csrf }: { data: any; csrf: string }) {
  const [data, setData] = useState(
    initialData || { supplier: {}, products: [], orders: [], settlements: [], totals: {} },
  );
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState<Record<string, { carrier: string; tracking_number: string }>>({});
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const orders: Row[] = data.orders || [];
  const products: Row[] = data.products || [];
  const settlements: Row[] = data.settlements || [];
  const fulfillmentPending = useMemo(
    () =>
      orders.filter(
        (order) =>
          !order.fulfillment?.tracking_number &&
          !['cancelled', 'refunded', 'expired'].includes(String(order.status || '')),
      ),
    [orders],
  );
  const readyToRemit = settlements
    .filter((row) => row.status === 'ready_to_remit')
    .reduce((sum, row) => sum + Number(row.product_cost || 0), 0);

  function clearMessage() {
    setNotice('');
    setError('');
  }

  async function reload() {
    setBusy('reload');
    clearMessage();
    try {
      setData(await legacyRequest<any>('supplier.dashboard'));
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  function trackingFor(order: Row) {
    return (
      tracking[String(order.id)] || {
        carrier: String(order.fulfillment?.carrier || ''),
        tracking_number: String(order.fulfillment?.tracking_number || ''),
      }
    );
  }

  function patchTracking(order: Row, patch: Partial<{ carrier: string; tracking_number: string }>) {
    const id = String(order.id);
    const base = trackingFor(order);
    setTracking((current) => ({ ...current, [id]: { ...base, ...current[id], ...patch } }));
  }

  async function updateFulfillment(order: Row) {
    const row = trackingFor(order);
    if (!row.tracking_number.trim()) {
      setError('กรุณากรอกเลขพัสดุ');
      return;
    }
    setBusy(`order:${order.id}`);
    clearMessage();
    try {
      await legacyRequest(
        'supplier.fulfillment.update',
        {
          order_id: order.id,
          carrier: row.carrier,
          tracking_number: row.tracking_number.trim(),
          status: 'packed',
          csrf,
        },
        'POST',
      );
      setNotice(`บันทึก Fulfillment ของ ${order.order_no || order.id} แล้ว`);
      await reload();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 10) {
      setError('รหัสผ่านใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร');
      return;
    }
    setBusy('password');
    clearMessage();
    try {
      await legacyRequest(
        'supplier.password',
        { old_password: oldPassword, new_password: newPassword, csrf },
        'POST',
      );
      setOldPassword('');
      setNewPassword('');
      setNotice('เปลี่ยนรหัสผ่าน Supplier แล้ว');
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-r from-emerald-950 to-emerald-800 p-5 text-white shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
              SUPPLIER WORKSPACE
            </p>
            <h2 className="mt-1 text-2xl font-black">{data.supplier?.name || 'ซัพพลายเออร์'}</h2>
            <p className="mt-1 text-xs text-emerald-100/70">
              {data.supplier?.code || ''} · Fulfillment SLA {data.supplier?.fulfillment_sla_days ?? '—'} วัน ·
              Settlement {data.supplier?.settlement_terms_days ?? '—'} วัน
            </p>
          </div>
          <button
            type="button"
            disabled={busy === 'reload'}
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-black"
          >
            <RefreshCcw size={14} className={busy === 'reload' ? 'animate-spin' : ''} />
            รีเฟรชข้อมูล
          </button>
        </div>
      </section>
      {notice && (
        <p className="rounded-xl bg-emerald-100 p-3 text-sm font-semibold text-emerald-900">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-100 p-3 text-sm font-semibold text-rose-800" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Boxes size={18} />}
          label="สินค้าที่ดูแล"
          value={String(products.length)}
          note="Assigned catalog"
        />
        <Metric
          icon={<PackageCheck size={18} />}
          label="ออเดอร์ Supplier"
          value={String(orders.length)}
          note="จาก settlement ledger"
        />
        <Metric
          icon={<Truck size={18} />}
          label="รอ Fulfillment"
          value={String(fulfillmentPending.length)}
          note="ยังไม่มีเลขพัสดุ"
          warning={fulfillmentPending.length > 0}
        />
        <Metric
          icon={<CircleDollarSign size={18} />}
          label="พร้อมรับชำระ"
          value={baht(readyToRemit)}
          note="ready_to_remit"
        />
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Fulfillment Queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              เห็นเฉพาะออเดอร์ที่มี settlement ของ Supplier นี้ Backend ตรวจสิทธิ์ซ้ำทุกครั้ง
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">
            รอ {fulfillmentPending.length}
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          {orders.map((order) => {
            const row = trackingFor(order);
            return (
              <article key={order.id} className="rounded-2xl border p-4">
                <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black">{order.order_no || order.id}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase">
                        {order.status || '—'}
                      </span>
                      {order.fulfillment?.tracking_number && (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                          FULFILLED
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {order.name || '—'} · {order.phone || '—'} · {when(order.created_at)}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {order.address || '—'} {order.province || ''} {order.zip || ''}
                    </p>
                    <div className="mt-3 divide-y rounded-xl bg-slate-50">
                      {(order.items || []).map((item: Row, index: number) => (
                        <div
                          key={`${item.id || item.sku || index}-${index}`}
                          className="flex justify-between gap-3 px-3 py-2 text-xs"
                        >
                          <span>
                            {item.name || item.product_name || 'สินค้า'}
                            {item.variant_label ? ` · ${item.variant_label}` : ''}
                          </span>
                          <strong>× {Number(item.qty || 0).toLocaleString('th-TH')}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Shipping update
                    </h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-600">
                        ขนส่ง
                        <select
                          value={row.carrier}
                          onChange={(event) => patchTracking(order, { carrier: event.target.value })}
                          className="mt-1 h-10 w-full rounded-xl border bg-white px-3 font-normal"
                        >
                          <option value="">— เลือกขนส่ง —</option>
                          {CARRIERS.map((carrier) => (
                            <option key={carrier.id} value={carrier.id}>
                              {carrier.name}
                            </option>
                          ))}
                          {row.carrier && !CARRIERS.some((carrier) => carrier.id === row.carrier) && (
                            <option value={row.carrier}>{carrierName(row.carrier)} (เดิม)</option>
                          )}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        เลขพัสดุ
                        <input
                          value={row.tracking_number}
                          onChange={(event) => patchTracking(order, { tracking_number: event.target.value })}
                          className="mt-1 h-10 w-full rounded-xl border bg-white px-3 font-normal"
                          placeholder="Tracking number"
                        />
                      </label>
                    </div>
                    {order.fulfillment?.updated_at && (
                      <p className="mt-2 text-[10px] text-slate-400">
                        อัปเดตล่าสุด {when(order.fulfillment.updated_at)}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={busy === `order:${order.id}` || !row.tracking_number.trim()}
                      onClick={() => void updateFulfillment(order)}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"
                    >
                      <Truck size={14} />
                      {busy === `order:${order.id}`
                        ? 'กำลังบันทึก…'
                        : order.fulfillment?.tracking_number
                          ? 'อัปเดต Tracking'
                          : 'ยืนยัน Fulfillment'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!orders.length && (
            <p className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-400">
              ยังไม่มีออเดอร์ที่มอบหมายให้ Supplier นี้
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="font-black">สินค้าที่ดูแล</h2>
            <p className="mt-1 text-xs text-slate-500">
              ราคา ต้นทุน และ stock aggregate ของสินค้าที่ Platform assign มา
            </p>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">สินค้า</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">ราคา</th>
                  <th className="px-4 py-3 text-right">ต้นทุน</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t">
                    <td className="px-4 py-3 font-bold">{product.name}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs">{product.sku || '—'}</code>
                    </td>
                    <td className="px-4 py-3 text-right font-black">
                      {Number(product.stock || 0).toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right">{baht(product.price)}</td>
                    <td className="px-4 py-3 text-right">{baht(product.cost_price)}</td>
                    <td className="px-4 py-3 text-xs uppercase">{product.state || '—'}</td>
                  </tr>
                ))}
                {!products.length && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400">
                      ยังไม่มีสินค้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-black">Settlement Ledger</h2>
          <p className="mt-1 text-xs text-slate-500">
            Platform เป็นผู้ควบคุมสถานะการโอนเงิน Supplier อ่านสถานะของตัวเองได้
          </p>
          <div className="mt-4 max-h-[460px] space-y-2 overflow-auto">
            {settlements.map((row) => (
              <article key={row.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">{row.order_no || row.order_id || '—'}</strong>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {when(row.created_at)} · {row.status || '—'}
                    </p>
                  </div>
                  <strong className="text-sm text-emerald-800">{baht(row.product_cost)}</strong>
                </div>
                {row.remittance_reference && (
                  <p className="mt-2 text-xs text-slate-500">Ref: {row.remittance_reference}</p>
                )}
              </article>
            ))}
            {!settlements.length && (
              <p className="py-10 text-center text-sm text-slate-400">ยังไม่มี Settlement</p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <KeyRound size={17} className="text-emerald-700" />
          <div>
            <h2 className="font-black">ความปลอดภัยบัญชี</h2>
            <p className="text-xs text-slate-500">เปลี่ยนรหัสผ่าน Supplier โดยตรวจรหัสเดิมฝั่ง Backend</p>
          </div>
        </div>
        <form onSubmit={changePassword} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            className="h-11 rounded-xl border px-3 text-sm"
            placeholder="รหัสผ่านเดิม"
          />
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="h-11 rounded-xl border px-3 text-sm"
            placeholder="รหัสผ่านใหม่อย่างน้อย 10 ตัว"
          />
          <button
            disabled={busy === 'password'}
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-black text-white"
          >
            {busy === 'password' ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${warning ? 'border-amber-200' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <span className={warning ? 'text-amber-700' : 'text-emerald-700'}>{icon}</span>
      </div>
      <strong className={`mt-2 block text-2xl font-black ${warning ? 'text-amber-800' : 'text-slate-950'}`}>
        {value}
      </strong>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </article>
  );
}
