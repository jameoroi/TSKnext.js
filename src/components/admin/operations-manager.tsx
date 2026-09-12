'use client';

import { useMemo, useState } from 'react';
import { RefreshCcw, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { legacyRequest, LegacyApiError } from '@/lib/legacy-api.client';

type Tab = { key: string; label: string; load: string; ownerOnly?: boolean };
const TABS: Tab[] = [
  { key: 'orders', label: 'คำสั่งซื้อ', load: 'admin.orders.list' },
  { key: 'slips', label: 'สลิปชำระเงิน', load: 'admin.slips.list' },
  { key: 'returns', label: 'คืนสินค้า', load: 'admin.returns.list' },
  { key: 'agents', label: 'ตัวแทน', load: 'admin.agents.list' },
  { key: 'customers', label: 'ลูกค้า', load: 'admin.customers.list' },
  { key: 'coupons', label: 'คูปอง', load: 'admin.coupons.list' },
  { key: 'reviews', label: 'รีวิว', load: 'admin.reviews.list' },
  { key: 'payouts', label: 'ถอนเงิน', load: 'admin.payouts.list', ownerOnly: true },
  { key: 'suppliers', label: 'Supplier', load: 'admin.suppliers.list', ownerOnly: true },
  { key: 'users', label: 'ผู้ดูแล', load: 'admin.users.list' },
  { key: 'media', label: 'Media', load: 'admin.media.list' },
  { key: 'audit', label: 'Audit log', load: 'admin.audit.list' },
];
const WRITE_ACTIONS = [
  'admin.order.status', 'admin.order.shipping', 'admin.slip.verify', 'admin.returns.status', 'admin.agents.action',
  'admin.coupons.save', 'admin.coupons.delete', 'admin.reviews.moderate', 'admin.payout.action',
  'admin.suppliers.save', 'admin.suppliers.credentials', 'admin.suppliers.assign_products',
  'admin.users.create', 'admin.users.update', 'admin.users.delete', 'admin.media.delete', 'admin.customer.note',
  'admin.backup.restore', 'admin.marketplace.import.preview', 'admin.marketplace.import.commit',
  'shopee.auth_url', 'shopee.products', 'lazada.auth_url', 'lazada.products',
] as const;

function errorCode(error: unknown) { return error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown'; }
function firstArray(payload: any, key: string) {
  const direct = payload?.[key];
  if (Array.isArray(direct)) return direct;
  for (const value of Object.values(payload || {})) if (Array.isArray(value)) return value;
  return payload && typeof payload === 'object' ? [payload] : [];
}
function preferredKey(tab: string) { return ({ orders:'orders', slips:'slips', returns:'returns', agents:'agents', customers:'customers', coupons:'coupons', reviews:'reviews', payouts:'payouts', suppliers:'suppliers', users:'users', media:'assets', audit:'logs' } as Record<string,string>)[tab] || tab; }

export function OperationsManager({ initial, csrf, owner, initialTab = 'orders' }: { initial: any; csrf: string; owner: boolean; initialTab?: string }) {
  const visibleTabs = useMemo(() => TABS.filter((tab) => !tab.ownerOnly || owner), [owner]);
  const [active, setActive] = useState(visibleTabs.some((tab) => tab.key === initialTab) ? initialTab : 'orders');
  const [records, setRecords] = useState<any>(initial);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [writeAction, setWriteAction] = useState<string>(WRITE_ACTIONS[0]);
  const [payloadText, setPayloadText] = useState('{}');
  const activeTab = visibleTabs.find((tab) => tab.key === active) || visibleTabs[0]!;
  const rows = firstArray(records, preferredKey(active));

  async function load(tab = activeTab) {
    setLoading(true); setError('');
    try { setRecords(await legacyRequest<any>(tab.load, tab.key === 'customers' ? { q: '' } : {})); }
    catch (e) { setError(`โหลดข้อมูลไม่สำเร็จ: ${errorCode(e)}`); }
    finally { setLoading(false); }
  }

  async function selectTab(key: string) {
    const tab = visibleTabs.find((row) => row.key === key);
    if (!tab) return;
    setActive(key); setRecords({}); setNotice(''); setError('');
    await load(tab);
  }

  async function write(action: string, payload: Record<string, unknown>) {
    setLoading(true); setError(''); setNotice('');
    try {
      if (/^(shopee|lazada)\./.test(action)) {
        const response = await fetch('/api/marketplace', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload, csrf }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok === false) throw new Error(String(body?.error || `http_${response.status}`));
      } else await legacyRequest(action, { ...payload, csrf }, 'POST');
      setNotice(`ดำเนินการ ${action} สำเร็จ`);
      await load();
    } catch (e) { setError(`ดำเนินการไม่สำเร็จ: ${errorCode(e)}`); }
    finally { setLoading(false); }
  }

  async function submitRaw(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = JSON.parse(payloadText || '{}');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload_must_be_object');
      await write(writeAction, payload);
    } catch (e) { setError(e instanceof SyntaxError ? 'Payload JSON ไม่ถูกต้อง' : `ดำเนินการไม่สำเร็จ: ${errorCode(e)}`); }
  }

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="overflow-x-auto border-b bg-slate-50 p-2"><div className="flex min-w-max gap-1">{visibleTabs.map((tab) => <button key={tab.key} type="button" onClick={() => void selectTab(tab.key)} className={`rounded-xl px-3 py-2 text-xs font-bold ${active === tab.key ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-white'}`}>{tab.label}</button>)}</div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">{activeTab.label}</h2><p className="text-xs text-slate-500">{rows.length.toLocaleString('th-TH')} รายการ · {activeTab.load}</p></div><button type="button" disabled={loading} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><RefreshCcw size={15} className={loading ? 'animate-spin' : ''}/>รีเฟรช</button></div>
      {notice && <p className="m-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
      {error && <p className="m-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}
      {loading && !rows.length ? <p className="p-10 text-center text-sm text-slate-500">กำลังโหลด…</p> : <RecordTable rows={rows} tab={active} busy={loading} write={write}/>} 
    </section>

    <form onSubmit={submitRaw} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><ShieldAlert size={20}/></span><div><h2 className="font-bold">Advanced API Console</h2><p className="mt-1 text-xs leading-5 text-slate-600">ใช้กับงานหลังบ้านที่ต้องระบุ payload ตาม API contract โดยตรง ระบบจะเติม CSRF ของ session ปัจจุบันให้ ทุก action ที่เขียนข้อมูลจะถูก audit ตาม backend เดิม</p></div></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]"><label><span className="mb-1.5 block text-sm font-semibold">Action</span><select value={writeAction} onChange={(e) => setWriteAction(e.target.value)} className="h-11 w-full rounded-xl border bg-white px-3 text-sm">{WRITE_ACTIONS.map((action) => <option key={action}>{action}</option>)}</select></label><label><span className="mb-1.5 block text-sm font-semibold">Payload JSON</span><textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} spellCheck={false} rows={7} className="w-full rounded-xl border bg-slate-950 p-3 font-mono text-xs text-slate-100"/></label></div>
      <button disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send size={16}/>ส่งคำสั่ง</button>
    </form>
  </div>;
}

function RecordTable({ rows, tab, busy, write }: { rows: any[]; tab: string; busy: boolean; write: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const columns = useMemo(() => {
    const priority: Record<string, string[]> = {
      orders: ['order_no','customer_name','name','total','payment_method','status','tracking_number','created_at'],
      slips: ['order_no','amount','status','bank','created_at','reviewed_by'],
      returns: ['order_no','customer_name','phone','reason','status','created_at'],
      customers: ['name','email','phone','province','admin_note','created_at'],
      reviews: ['customer_name','product_id','rating','comment','verified_purchase','status','created_at'],
      payouts: ['agent_store_name','agent_id','amount','status','created_at','reference'],
      suppliers: ['name','code','email','status','fulfillment_sla_days','settlement_terms_days','updated_at'],
      media: ['key','url','owner_type','owner_id','size','content_type','created_at'],
      audit: ['at','action','username','role','ip','details'],
    };
    const preferred = priority[tab] || [];
    const discovered = [...new Set(rows.slice(0, 30).flatMap((row) => row && typeof row === 'object' ? Object.keys(row) : []))];
    return [...new Set([...preferred, ...discovered])].filter((key) => !/password|secret|token|hash|proof/i.test(key)).slice(0, 9);
  }, [rows, tab]);
  return <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500"><tr>{columns.map((key) => <th key={key} className="px-4 py-3">{key.replaceAll('_',' ')}</th>)}{['slips','returns','reviews','media','customers'].includes(tab) && <th className="px-4 py-3 text-right">จัดการ</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row?.id || row?.key || row?.order_no || index)} className="border-t align-top">{columns.map((key) => <td key={key} className="max-w-[280px] px-4 py-3"><Cell value={row?.[key]}/></td>)}{['slips','returns','reviews','media','customers'].includes(tab) && <td className="px-4 py-3"><RowActions row={row} tab={tab} disabled={busy} write={write}/></td>}</tr>)}{!rows.length && <tr><td colSpan={columns.length + 1} className="p-10 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>}</tbody></table></div>;
}

function Cell({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="text-slate-300">—</span>;
  if (typeof value === 'boolean') return <span>{value ? '✓' : '—'}</span>;
  if (typeof value === 'object') return <code className="block max-h-20 overflow-hidden whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(value)}</code>;
  const text = String(value);
  if (/^https?:\/\//.test(text)) return <a href={text} target="_blank" rel="noreferrer" className="text-emerald-800 underline">เปิด</a>;
  return <span className="block max-h-20 overflow-hidden whitespace-pre-wrap break-words">{text}</span>;
}

function RowActions({ row, tab, disabled, write }: { row: any; tab: string; disabled: boolean; write: (action: string, payload: Record<string, unknown>) => Promise<void> }) {
  const [customerOrders, setCustomerOrders] = useState<any[] | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');

  async function loadCustomerOrders() {
    const id = String(row?.id || '');
    if (!id) return;
    setDetailBusy(true); setDetailError('');
    try {
      const answer = await legacyRequest<any>('admin.customer.orders', { id });
      setCustomerOrders(Array.isArray(answer.orders) ? answer.orders : []);
    } catch (error) {
      setDetailError(`โหลดคำสั่งซื้อไม่สำเร็จ: ${errorCode(error)}`);
      setCustomerOrders([]);
    } finally { setDetailBusy(false); }
  }

  if (tab === 'slips') return <div className="flex justify-end gap-1"><button disabled={disabled} onClick={() => void write('admin.slip.verify', { id: row.id, approve: true })} className="rounded-lg bg-emerald-950 px-2.5 py-1.5 text-xs font-bold text-white">อนุมัติ</button><button disabled={disabled} onClick={() => void write('admin.slip.verify', { id: row.id, approve: false })} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold text-rose-700">ปฏิเสธ</button></div>;
  if (tab === 'returns') return <select disabled={disabled} value={String(row.status || 'requested')} onChange={(e) => void write('admin.returns.status', { id: row.id, status: e.target.value, admin_note: row.admin_note || '' })} className="float-right rounded-lg border px-2 py-1 text-xs">{['requested','approved','rejected','received','refunded','closed'].map((status) => <option key={status}>{status}</option>)}</select>;
  if (tab === 'reviews') return <select disabled={disabled} value={String(row.status || 'pending')} onChange={(e) => void write('admin.reviews.moderate', { id: row.id, status: e.target.value })} className="float-right rounded-lg border px-2 py-1 text-xs">{['pending','approved','rejected'].map((status) => <option key={status}>{status}</option>)}</select>;
  if (tab === 'media') return <button disabled={disabled} onClick={() => window.confirm(`ลบไฟล์ ${row.key || ''}?`) && void write('admin.media.delete', { key: row.key })} className="float-right rounded-lg border p-2 text-rose-700" aria-label="ลบไฟล์"><Trash2 size={15}/></button>;
  if (tab === 'customers') return <>
    <div className="flex justify-end gap-1">
      <button disabled={disabled || detailBusy} onClick={() => void loadCustomerOrders()} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">{detailBusy ? 'กำลังโหลด…' : 'ดูออเดอร์'}</button>
      <button disabled={disabled} onClick={() => { const note = window.prompt('บันทึกภายในสำหรับลูกค้ารายนี้', String(row.admin_note || '')); if (note !== null) void write('admin.customer.note', { id: row.id, note }); }} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">บันทึกโน้ต</button>
    </div>
    {customerOrders !== null && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="คำสั่งซื้อของลูกค้า">
      <div className="max-h-[82vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b p-5"><div><h3 className="font-black">คำสั่งซื้อของ {row.name || row.email || row.id}</h3><p className="mt-1 text-xs text-slate-500">Customer ID: {row.id || '—'} · {customerOrders.length.toLocaleString('th-TH')} รายการ</p></div><button onClick={() => setCustomerOrders(null)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">ปิด</button></div>
        {detailError && <p className="m-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{detailError}</p>}
        <div className="max-h-[64vh] overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Tracking</th><th className="px-4 py-3">Created</th></tr></thead><tbody>{customerOrders.map((order, index) => <tr key={String(order.id || order.order_no || index)} className="border-t"><td className="px-4 py-3 font-bold">{order.order_no || order.id || '—'}</td><td className="px-4 py-3">{order.status || '—'}</td><td className="px-4 py-3">{order.payment_status || order.payment_method || '—'}</td><td className="px-4 py-3 text-right font-black">฿{Number(order.total || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}</td><td className="px-4 py-3 text-xs">{order.tracking_number || order.fulfillment?.[0]?.tracking_number || '—'}</td><td className="px-4 py-3 text-xs text-slate-500">{order.created_at ? new Date(order.created_at).toLocaleString('th-TH') : '—'}</td></tr>)}{!customerOrders.length && <tr><td colSpan={6} className="p-10 text-center text-slate-400">ลูกค้ารายนี้ยังไม่มีคำสั่งซื้อ</td></tr>}</tbody></table></div>
      </div>
    </div>}
  </>;
  return null;
}
