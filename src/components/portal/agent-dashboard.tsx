'use client';

import { useMemo, useState } from 'react';
import { BanknoteArrowDown, Copy, ExternalLink, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { AdminDataTable } from '@/components/admin/data-table';
import { MetricGrid } from '@/components/admin/page-header';
import { legacyRequest, LegacyApiError } from '@/lib/legacy-api.client';

type Props = { initial: any; csrf: string };

export function AgentDashboard({ initial, csrf }: Props) {
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const agent = data.agent || {};
  const available = Number(data.totals?.commission_available ?? data.totals?.available ?? data.totals?.available_commission ?? 0);
  const payoutMinimum = Number(data.totals?.payout_minimum ?? 0);
  const pendingPayout = useMemo(() => (data.payouts || []).find((row: any) => row.status === 'pending'), [data.payouts]);

  async function refresh() { setData(await legacyRequest<any>('agent.dashboard')); }
  async function requestPayout(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const value = Number(amount || 0);
      const result = await legacyRequest<any>('agent.payout.request', { amount: value > 0 ? value : undefined, csrf }, 'POST');
      setNotice(`ส่งคำขอถอนเงินแล้ว ${result.payout?.payout_no || ''}`);
      setAmount(''); await refresh();
    } catch (error) {
      const code = error instanceof LegacyApiError ? error.code : 'unknown';
      const map: Record<string,string> = { payout_already_pending: 'มีคำขอถอนเงินที่รออนุมัติอยู่แล้ว', no_available_commission: 'ยังไม่มีค่าคอมที่ถอนได้', payout_amount_exceeds_available: 'ยอดที่ขอมากกว่ายอดที่ถอนได้', payout_below_minimum: 'ยอดที่ขอต่ำกว่ายอดถอนขั้นต่ำ', payout_request_in_progress: 'ระบบกำลังประมวลผลคำขอ กรุณารอสักครู่' };
      setNotice(`ผิดพลาด: ${map[code] || code}`);
    } finally { setBusy(false); }
  }

  const storeUrl = agent.referral_code ? `/store?ref=${encodeURIComponent(agent.referral_code)}` : '';
  return <div className="space-y-6">
    <section className="rounded-3xl bg-gradient-to-br from-emerald-950 to-emerald-800 p-6 text-white shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-sm font-semibold text-emerald-200">Authorized Partner</p><h2 className="mt-1 text-3xl font-black">{agent.store_name || 'ร้านตัวแทน'}</h2><p className="mt-2 text-sm text-white/70">Agent {agent.agent_id || '—'} · ระดับ {agent.level_label || agent.standing?.label || '—'} · คอมมิชชั่น {Number(agent.effective_rate ?? agent.commission_rate ?? 0).toLocaleString('th-TH')}%</p></div>{storeUrl && <div className="flex gap-2"><button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${storeUrl}`)} className="rounded-xl border border-white/20 p-2.5" aria-label="คัดลอกลิงก์"><Copy size={18}/></button><Link href={storeUrl} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-emerald-950">เปิดหน้าร้าน <ExternalLink size={16}/></Link></div>}</div>
      {agent.next_level_label || agent.next_level_at || agent.next_level_remaining ? <div className="mt-6 rounded-2xl bg-white/10 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs"><span>ความคืบหน้าระดับถัดไป</span><span>{agent.next_level_label ? `เป้าหมาย ${agent.next_level_label}` : ''} {agent.next_level_rate ? `· ${agent.next_level_rate}%` : ''}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, Number(agent.level_progress || agent.standing?.progress || 0)))}%` }}/></div>{Number(agent.next_level_remaining || 0) > 0 && <p className="mt-2 text-xs text-white/70">อีก ฿{Number(agent.next_level_remaining).toLocaleString('th-TH')} ถึงระดับถัดไป</p>}</div> : null}
    </section>

    <MetricGrid metrics={data.totals || {}}/>
    {notice && <p className={`rounded-2xl border p-4 text-sm font-semibold ${notice.startsWith('ผิด') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice}</p>}

    <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><TrendingUp className="text-emerald-800"/><div><h2 className="font-bold">สรุปค่าคอมมิชชั่น</h2><p className="text-xs text-slate-500">รายการคอมจากออเดอร์ที่เข้าเงื่อนไข</p></div></div><div className="mt-4 max-h-[420px] overflow-auto"><AdminDataTable title="Commission ledger" rows={data.commissions || []}/></div></div>
      <form onSubmit={requestPayout} className="h-fit rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><BanknoteArrowDown className="text-emerald-800"/><div><h2 className="font-bold">ถอนค่าคอมมิชชั่น</h2><p className="text-xs text-slate-500">ยอดที่ถอนได้ ฿{available.toLocaleString('th-TH')} {payoutMinimum > 0 ? `· ขั้นต่ำ ฿${payoutMinimum.toLocaleString('th-TH')}` : ''}</p></div></div>{pendingPayout ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><strong>มีคำขอรออนุมัติ</strong><p className="mt-1">{pendingPayout.payout_no || pendingPayout.id} · ฿{Number(pendingPayout.amount || 0).toLocaleString('th-TH')}</p></div> : <><label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold">ยอดที่ต้องการถอน</span><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`เว้นว่างเพื่อถอนทั้งหมด ${available.toLocaleString('th-TH')}`} className="h-11 w-full rounded-xl border px-3"/></label><button disabled={busy || available <= 0} className="mt-4 w-full rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white disabled:opacity-50">{busy ? 'กำลังส่งคำขอ…' : 'ส่งคำขอถอนเงิน'}</button></>}</form>
    </section>

    <AdminDataTable title="ออเดอร์ผ่านตัวแทน" rows={data.orders || []} columns={[{key:'order_no',label:'Order'},{key:'name',label:'ลูกค้า'},{key:'total',label:'ยอดรวม'},{key:'status',label:'สถานะ'},{key:'created_at',label:'วันที่'}]}/>
    <AdminDataTable title="ประวัติการถอนเงิน" rows={data.payouts || []}/>
  </div>;
}
