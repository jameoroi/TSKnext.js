'use client';

import { BadgeCheck, RefreshCcw, RotateCcw, Save, ShieldAlert, TrendingUp, UserCheck, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { legacyRequest, LegacyApiError } from '@/lib/legacy-api.client';

type Row = Record<string, any>;
type Level = { level: number; label: string; min_sales: number; commission_rate: number };

function code(error: unknown) {
  return error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
}

function friendly(error: unknown) {
  const key = code(error);
  const messages: Record<string, string> = {
    forbidden_super_admin_only: 'บัญชีนี้ไม่มีสิทธิ์ Super Admin สำหรับจัดการตัวแทน',
    invalid_csrf: 'เซสชันหมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่',
    application_not_found: 'ไม่พบใบสมัครนี้ อาจมีผู้ดูแลคนอื่นดำเนินการแล้ว',
    agent_password_missing: 'ใบสมัครไม่มีรหัสผ่านที่ตัวแทนตั้งไว้ กรุณาให้สมัครใหม่',
    referral_code_taken: 'รหัสตัวแทนซ้ำกับตัวแทนรายอื่น',
    upline_not_found: 'ไม่พบตัวแทนระดับบนที่เลือก',
    agent_not_found: 'ไม่พบข้อมูลตัวแทน',
  };
  return messages[key] || key;
}

const money = (value: unknown) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });

export function AgentManager({ initial, csrf }: { initial: any; csrf: string }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries([...(initial.applications || []), ...(initial.agents || [])].map((item: Row) => [String(item.id), item.commission_rate_override == null ? '' : String(item.commission_rate_override)])));
  const [levels, setLevels] = useState<Level[]>(() => Array.isArray(initial.levels) ? initial.levels.map((row: Row) => ({ level: Number(row.level || 0), label: String(row.label || ''), min_sales: Number(row.min_sales || 0), commission_rate: Number(row.commission_rate || 0) })) : []);
  const [levelDefaults, setLevelDefaults] = useState<Level[]>([]);

  const pending = useMemo(() => (data.applications || []).filter((row: Row) => row.status === 'pending'), [data]);

  async function reload() {
    setBusy('reload'); setError('');
    try {
      const [next, ladder] = await Promise.all([
        legacyRequest<any>('admin.agents.list'),
        legacyRequest<any>('admin.agents.levels'),
      ]);
      setData(next);
      if (Array.isArray(ladder.levels)) setLevels(ladder.levels.map((row: Row) => ({ level: Number(row.level || 0), label: String(row.label || ''), min_sales: Number(row.min_sales || 0), commission_rate: Number(row.commission_rate || 0) })));
      if (Array.isArray(ladder.defaults)) setLevelDefaults(ladder.defaults.map((row: Row) => ({ level: Number(row.level || 0), label: String(row.label || ''), min_sales: Number(row.min_sales || 0), commission_rate: Number(row.commission_rate || 0) })));
    } catch (err) { setError(`โหลดข้อมูลไม่สำเร็จ: ${friendly(err)}`); }
    finally { setBusy(''); }
  }

  async function run(id: string, operation: string, payload: Row = {}) {
    setBusy(id); setNotice(''); setError('');
    try {
      await legacyRequest('admin.agents.action', { id, operation, ...payload, csrf }, 'POST');
      setNotice(operation === 'approve' ? 'อนุมัติตัวแทนแล้ว ใช้รหัสผ่านที่ตั้งไว้ตอนสมัครได้ทันที' : 'บันทึกการเปลี่ยนแปลงแล้ว');
      await reload();
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  async function approve(application: Row) {
    const raw = rates[String(application.id)] ?? '';
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('กรุณากรอกค่าคอมเป็นตัวเลข 0–100');
      return;
    }
    await run(String(application.id), 'approve', { commission_rate: value });
  }

  async function setRate(agent: Row) {
    const raw = String(rates[String(agent.id)] ?? '').trim();
    if (raw === '') return run(String(agent.id), 'set_rate', { commission_rate: '' });
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('ค่าคอม override ต้องอยู่ระหว่าง 0–100 และใช้ทศนิยมได้');
      return;
    }
    await run(String(agent.id), 'set_rate', { commission_rate: value });
  }

  async function saveLevels() {
    setBusy('levels'); setNotice(''); setError('');
    try {
      const result = await legacyRequest<any>('admin.agents.levels.save', { levels, csrf }, 'POST');
      if (Array.isArray(result.levels)) setLevels(result.levels.map((row: Row) => ({ level: Number(row.level || 0), label: String(row.label || ''), min_sales: Number(row.min_sales || 0), commission_rate: Number(row.commission_rate || 0) })));
      setNotice('บันทึกระดับตัวแทนและค่าคอมแล้ว');
      await reload();
    } catch (err) { setError(`บันทึกระดับไม่สำเร็จ: ${friendly(err)}`); }
    finally { setBusy(''); }
  }

  async function loadDefaults() {
    setBusy('defaults'); setError('');
    try {
      const ladder = await legacyRequest<any>('admin.agents.levels');
      const defaults = Array.isArray(ladder.defaults) ? ladder.defaults.map((row: Row) => ({ level: Number(row.level || 0), label: String(row.label || ''), min_sales: Number(row.min_sales || 0), commission_rate: Number(row.commission_rate || 0) })) : [];
      setLevelDefaults(defaults);
      if (defaults.length) setLevels(defaults);
    } catch (err) { setError(`โหลดค่าเริ่มต้นไม่สำเร็จ: ${friendly(err)}`); }
    finally { setBusy(''); }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void reload()} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-bold"><RefreshCcw size={16} className={busy === 'reload' ? 'animate-spin' : ''}/>รีเฟรช</button><span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">ตัวแทน {(data.agents || []).length.toLocaleString('th-TH')} ราย</span><span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">รออนุมัติ {pending.length.toLocaleString('th-TH')}</span></div>
    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><UserCheck size={18}/></span><div><h2 className="font-black">ใบสมัครรออนุมัติ</h2><p className="text-xs text-slate-500">ตัวแทนใช้รหัสผ่านที่ตั้งเองตอนสมัคร ระบบไม่สร้างรหัสชั่วคราวให้</p></div></div><div className="mt-4 grid gap-3">{pending.map((row: Row) => <article key={row.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-black">{row.store_name || `${row.first_name || ''} ${row.last_name || ''}`}</h3><p className="mt-1 text-xs text-slate-500">{row.email} · {row.phone} · {row.province || '—'}</p></div><div className="flex flex-wrap items-end gap-2"><label><span className="mb-1 block text-[10px] font-bold text-slate-500">ค่าคอมเริ่มต้น %</span><input type="number" min="0" max="100" step="0.01" value={rates[String(row.id)] ?? ''} onChange={(event) => setRates((current) => ({ ...current, [String(row.id)]: event.target.value }))} className="h-10 w-28 rounded-xl border px-3 text-sm"/></label><button disabled={busy === String(row.id)} onClick={() => void approve(row)} className="rounded-xl bg-emerald-950 px-3 py-2.5 text-xs font-black text-white">อนุมัติ</button><button disabled={busy === String(row.id)} onClick={() => void run(String(row.id), 'reject', { reason: window.prompt('เหตุผลที่ไม่อนุมัติ', '') || '' })} className="rounded-xl border px-3 py-2.5 text-xs font-black text-rose-700"><UserX size={14} className="mr-1 inline"/>ไม่อนุมัติ</button></div></div></article>)}{!pending.length && <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">ไม่มีใบสมัครค้าง</p>}</div></section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BadgeCheck size={18} className="text-emerald-700"/><h2 className="font-black">ระดับตัวแทนและค่าคอม</h2></div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">ระดับเลื่อนตามยอดขายสะสม ค่าคอมของระดับจะถูกใช้โดยอัตโนมัติ ยกเว้นตัวแทนที่มี override เฉพาะราย</p></div><div className="flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => { if (levelDefaults.length) setLevels(levelDefaults.map((row) => ({ ...row }))); else void loadDefaults(); }} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><RotateCcw size={14}/>ค่าเริ่มต้น</button><button type="button" disabled={busy === 'levels'} onClick={() => void saveLevels()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-3 py-2 text-xs font-black text-white"><Save size={14}/>{busy === 'levels' ? 'กำลังบันทึก…' : 'บันทึกระดับ'}</button></div></div><div className="mt-4 grid gap-3">{levels.map((row, index) => <div key={`${row.level}-${index}`} className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-[90px_1fr_1fr_1fr]"><div className="flex items-center"><strong className="rounded-full bg-emerald-950 px-3 py-1.5 text-xs text-white">Lv {row.level || index + 1}</strong></div><label className="text-xs font-bold text-slate-600">ชื่อระดับ<input value={row.label} maxLength={40} onChange={(event) => setLevels((current) => current.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal"/></label><label className="text-xs font-bold text-slate-600">ยอดขายสะสมขั้นต่ำ<input type="number" min="0" step="1" disabled={index === 0} value={row.min_sales} onChange={(event) => setLevels((current) => current.map((item, i) => i === index ? { ...item, min_sales: Math.max(0, Number(event.target.value) || 0) } : item))} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal disabled:bg-slate-100"/></label><label className="text-xs font-bold text-slate-600">ค่าคอม %<input type="number" min="0" max="100" step="0.01" value={row.commission_rate} onChange={(event) => setLevels((current) => current.map((item, i) => i === index ? { ...item, commission_rate: Math.max(0, Math.min(100, Number(event.target.value) || 0)) } : item))} className="mt-1 h-10 w-full rounded-xl border bg-white px-3 text-sm font-normal"/></label></div>)}</div></section>

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><TrendingUp size={18}/></span><div><h2 className="font-black">ตัวแทนในระบบ</h2><p className="text-xs text-slate-500">ดู standing, lifetime sales, effective rate และตั้ง override เฉพาะราย</p></div></div><div className="mt-4 grid gap-3">{(data.agents || []).map((row: Row) => {
      const standing = row.standing || {};
      const progress = Math.max(0, Math.min(100, Number(standing.progress_percent ?? standing.progress ?? 0) || 0));
      return <article key={row.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{row.store_name || row.agent_id}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-black ${row.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span></div><p className="mt-1 text-xs text-slate-500">{row.agent_id} · {row.referral_code} · ยอดสะสม ฿{money(row.lifetime_sales)}</p><div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap justify-between gap-2 text-xs"><strong>Lv {standing.level || row.level || '—'} · {standing.label || row.level_label || '—'}</strong><span>Effective {Number(row.effective_rate ?? row.commission_rate ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }}/></div><p className="mt-2 text-[10px] text-slate-500">{standing.remaining != null && standing.next_level ? `อีก ฿${money(standing.remaining)} → Lv ${standing.next_level} ${standing.next_label || ''} (${standing.next_rate || 0}%)` : 'ระดับสูงสุดแล้ว'}</p></div></div><div className="flex flex-wrap items-end gap-2"><label><span className="mb-1 block text-[10px] font-bold text-slate-500">Override %</span><input type="number" min="0" max="100" step="0.01" placeholder="ตามระดับ" value={rates[String(row.id)] ?? ''} onChange={(event) => setRates((current) => ({ ...current, [String(row.id)]: event.target.value }))} className="h-10 w-28 rounded-xl border px-3 text-sm"/></label><button disabled={busy === String(row.id)} onClick={() => void setRate(row)} className="rounded-xl border px-3 py-2.5 text-xs font-bold">บันทึกคอม</button><button disabled={busy === String(row.id)} onClick={() => { setRates((current) => ({ ...current, [String(row.id)]: '' })); void run(String(row.id), 'set_rate', { commission_rate: '' }); }} className="rounded-xl border px-3 py-2.5 text-xs font-bold">ตามระดับ</button><button disabled={busy === String(row.id)} onClick={() => void run(String(row.id), row.status === 'approved' ? 'suspend' : 'reactivate')} className="rounded-xl border px-3 py-2.5 text-xs font-bold">{row.status === 'approved' ? 'ระงับ' : 'เปิดใช้งาน'}</button></div></div></article>;
    })}{!(data.agents || []).length && <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-400">ยังไม่มีตัวแทน</p>}</div></section>

    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 text-xs leading-5 text-amber-900"><div className="flex gap-2"><ShieldAlert size={16} className="mt-0.5 shrink-0"/><p>การอนุมัติ/ระงับตัวแทนและแก้ระดับค่าคอมเป็นสิทธิ์ Super Admin ฝั่ง API อยู่แล้ว ต่อให้เปิดหน้าจอได้ ระบบ backend จะปฏิเสธ action ที่ไม่มีสิทธิ์</p></div></section>
  </div>;
}
