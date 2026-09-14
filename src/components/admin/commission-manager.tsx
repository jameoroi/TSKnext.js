'use client';

import { Banknote, CheckCircle2, FileImage, RefreshCcw, Search, WalletCards, XCircle } from 'lucide-react';
import { type ChangeEvent, useMemo, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

type Row = Record<string, any>;
const baht = (value: unknown) =>
  `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const when = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function friendly(error: unknown) {
  const key =
    error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const messages: Record<string, string> = {
    forbidden_super_admin_only: 'ส่วนการเงินนี้ใช้ได้เฉพาะ Super Admin',
    invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    not_found: 'ไม่พบรายการจ่ายเงินนี้',
    payout_not_pending: 'รายการนี้ถูกดำเนินการไปแล้ว',
    payment_proof_required: 'กรุณาใส่เลขอ้างอิงการโอนหรือแนบหลักฐานการจ่ายเงิน',
    invalid_payment_proof: 'ไฟล์หลักฐานไม่ถูกต้อง รองรับ PNG / JPEG / WEBP',
    payout_contains_reversed_commission: 'Payout นี้มีค่าคอมที่ถูกยกเลิกอยู่ กรุณาตรวจสอบก่อนจ่าย',
    payout_allocation_invalid: 'Allocation ของ payout ไม่ตรงกับยอดรวม กรุณาตรวจสอบ ledger',
    invalid_operation: 'คำสั่งการจ่ายเงินไม่ถูกต้อง',
  };
  return messages[key] || key;
}

export function CommissionManager({ initial, csrf }: { initial: any; csrf: string }) {
  const [data, setData] = useState(initial || { commissions: [], payouts: [], totals: {} });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [references, setReferences] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');

  const payouts: Row[] = data.payouts || [];
  const commissions: Row[] = data.commissions || [];
  const pending = useMemo(() => payouts.filter((row) => row.status === 'pending'), [payouts]);
  const payoutHistory = useMemo(
    () =>
      [...payouts].sort((a, b) =>
        String(b.reviewed_at || b.paid_at || b.requested_at || b.created_at || '').localeCompare(
          String(a.reviewed_at || a.paid_at || a.requested_at || a.created_at || ''),
        ),
      ),
    [payouts],
  );
  const filteredLedger = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commissions.filter((row) => {
      if (ledgerStatus && String(row.status || '') !== ledgerStatus) return false;
      if (!needle) return true;
      return [row.agent_store_name, row.agent_id, row.order_no, row.order_id, row.id].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [commissions, ledgerStatus, query]);

  function clearMessage() {
    setNotice('');
    setError('');
  }

  async function reload() {
    setBusy('reload');
    clearMessage();
    try {
      setData(await legacyRequest<any>('admin.commissions.list'));
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function pay(payout: Row) {
    const id = String(payout.id);
    const reference = String(references[id] || '').trim();
    const proof = String(proofs[id] || '');
    if (!reference && !proof) {
      setError('ต้องใส่เลขอ้างอิงการโอนหรือแนบหลักฐานอย่างน้อยหนึ่งอย่าง');
      return;
    }
    if (
      !window.confirm(
        `ยืนยันว่าโอนเงินจริง ${baht(payout.amount)} ให้ ${payout.agent_store_name || payout.agent_id} แล้ว?`,
      )
    )
      return;
    setBusy(id);
    clearMessage();
    try {
      // Backend contract uses operation="pay". "approve" is intentionally not used:
      // it is not a valid financial operation and would return invalid_operation.
      await legacyRequest('admin.payout.action', { id, operation: 'pay', reference, proof, csrf }, 'POST');
      setNotice(`บันทึกการจ่าย ${baht(payout.amount)} แล้ว`);
      setReferences((current) => ({ ...current, [id]: '' }));
      setProofs((current) => ({ ...current, [id]: '' }));
      await reload();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function reject(payout: Row) {
    const id = String(payout.id);
    const reason = String(reasons[id] || '').trim();
    if (
      !window.confirm(
        `ปฏิเสธคำขอถอน ${baht(payout.amount)} ของ ${payout.agent_store_name || payout.agent_id} ?`,
      )
    )
      return;
    setBusy(id);
    clearMessage();
    try {
      await legacyRequest('admin.payout.action', { id, operation: 'reject', reason, csrf }, 'POST');
      setNotice('ปฏิเสธคำขอถอนเงินแล้ว ยอดที่ล็อกไว้จะกลับไปคำนวณใน balance');
      setReasons((current) => ({ ...current, [id]: '' }));
      await reload();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  function readProof(id: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setError('รองรับหลักฐาน PNG / JPEG / WEBP เท่านั้น');
      event.target.value = '';
      return;
    }
    // API stores the data URL and caps it around 2.2M characters; keep headroom for base64 expansion.
    if (file.size > 1_500_000) {
      setError('ไฟล์หลักฐานใหญ่เกินไป กรุณาใช้รูปไม่เกินประมาณ 1.5 MB');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProofs((current) => ({ ...current, [id]: String(reader.result || '') }));
    reader.onerror = () => setError('อ่านไฟล์หลักฐานไม่สำเร็จ');
    reader.readAsDataURL(file);
  }

  const totals = data.totals || {};

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="ถอนได้" value={baht(totals.available)} tone="good" />
        <Metric
          label="รออนุมัติ"
          value={baht(totals.pending)}
          tone={Number(totals.pending || 0) > 0 ? 'warn' : 'normal'}
        />
        <Metric label="จ่ายแล้ว" value={baht(totals.paid)} tone="normal" />
        <Metric
          label="ยอดติดลบ"
          value={baht(totals.debt)}
          tone={Number(totals.debt || 0) > 0 ? 'bad' : 'normal'}
        />
        <Metric label="ถูกย้อนรายการ" value={baht(totals.reversed)} tone="normal" />
        <Metric label="Ledger สุทธิ" value={baht(totals.all)} tone="normal" />
      </div>

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      )}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <WalletCards size={18} />
            </span>
            <div>
              <h2 className="font-black">Payout Queue</h2>
              <p className="mt-1 text-xs text-slate-500">โอนเงินจริงก่อน แล้วค่อยบันทึก reference/proof เพื่อปิดคำขอ</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy === 'reload'}
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
          >
            <RefreshCcw size={14} className={busy === 'reload' ? 'animate-spin' : ''} />
            รีเฟรช
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          {pending.map((payout) => {
            const id = String(payout.id);
            return (
              <article key={id} className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
                <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black">{payout.agent_store_name || payout.agent_id || 'Agent'}</h3>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900">
                        PENDING
                      </span>
                    </div>
                    <p className="mt-2 text-3xl font-black text-emerald-950">{baht(payout.amount)}</p>
                    <div className="mt-3 grid gap-1 text-xs text-slate-600">
                      <p>
                        Payout: <code>{payout.payout_no || payout.id}</code>
                      </p>
                      <p>ขอเมื่อ: {when(payout.requested_at || payout.created_at)}</p>
                      <p>
                        ธนาคาร: {payout.bank_name || '—'} · {payout.bank_account_name || '—'}
                      </p>
                      <p>บัญชี: {payout.bank_account_no_masked || '—'}</p>
                      <p>
                        Allocations: {Array.isArray(payout.allocations) ? payout.allocations.length : 0}{' '}
                        รายการ
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="grid gap-3">
                      <label className="text-xs font-bold text-slate-600">
                        เลขอ้างอิงการโอน
                        <input
                          value={references[id] || ''}
                          onChange={(event) =>
                            setReferences((current) => ({ ...current, [id]: event.target.value }))
                          }
                          className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"
                          placeholder="Transaction / bank reference"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        หลักฐานการจ่ายเงิน (ทางเลือก)
                        <span className="mt-1 flex h-10 items-center gap-2 rounded-xl border bg-white px-3 font-normal">
                          <FileImage size={14} />
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) => readProof(id, event)}
                            className="min-w-0 flex-1 text-xs"
                          />
                        </span>
                        {proofs[id] && (
                          <span className="mt-1 block text-[10px] font-normal text-emerald-700">
                            แนบรูปแล้ว
                          </span>
                        )}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === id}
                          onClick={() => void pay(payout)}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-xs font-black text-white"
                        >
                          <CheckCircle2 size={14} />
                          {busy === id ? 'กำลังบันทึก…' : 'ยืนยันว่าจ่ายแล้ว'}
                        </button>
                      </div>
                      <div className="border-t pt-3">
                        <label className="text-xs font-bold text-slate-600">
                          เหตุผลหากปฏิเสธ
                          <input
                            value={reasons[id] || ''}
                            onChange={(event) =>
                              setReasons((current) => ({ ...current, [id]: event.target.value }))
                            }
                            className="mt-1 h-10 w-full rounded-xl border px-3 font-normal"
                            placeholder="เว้นว่างได้"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy === id}
                          onClick={() => void reject(payout)}
                          className="mt-2 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black text-rose-700"
                        >
                          <XCircle size={14} />
                          ปฏิเสธคำขอ
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {!pending.length && (
            <p className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-400">
              ไม่มีคำขอถอนเงินที่รออนุมัติ
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <Banknote size={17} className="text-emerald-700" />
            <h2 className="font-black">ประวัติ Payout</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">เก็บ reference, ผู้ตรวจ และสถานะการจ่าย</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Payout</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reference / Reason</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {payoutHistory.slice(0, 200).map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">
                    <code className="text-xs">{row.payout_no || row.id}</code>
                  </td>
                  <td className="px-4 py-3 font-bold">{row.agent_store_name || row.agent_id}</td>
                  <td className="px-4 py-3 text-right font-black">{baht(row.amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${row.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : row.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}
                    >
                      {String(row.status || '—').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.payment_reference || row.remittance_reference || row.rejection_reason || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {when(row.paid_at || row.reviewed_at || row.requested_at || row.created_at)}
                  </td>
                </tr>
              ))}
              {!payoutHistory.length && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400">
                    ยังไม่มีประวัติการจ่ายเงิน
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div>
            <h2 className="font-black">Commission Ledger</h2>
            <p className="mt-1 text-xs text-slate-500">ค่าคอมต่อออเดอร์ เรียงตามข้อมูล backend</p>
          </div>
          <div className="flex gap-2">
            <label className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 rounded-xl border pl-8 pr-3 text-xs"
                placeholder="ค้นหา Agent / Order"
              />
            </label>
            <select
              value={ledgerStatus}
              onChange={(event) => setLedgerStatus(event.target.value)}
              className="h-9 rounded-xl border bg-white px-2 text-xs font-bold"
            >
              <option value="">ทุกสถานะ</option>
              {[...new Set(commissions.map((row) => String(row.status || '')).filter(Boolean))].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </div>
        </div>
        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-bold">{row.agent_store_name || row.agent_id || '—'}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs">{row.order_no || row.order_id || '—'}</code>
                  </td>
                  <td className="px-4 py-3 text-right font-black">{baht(row.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    {Number(row.rate || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${row.status === 'reversed' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}
                    >
                      {row.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{when(row.created_at)}</td>
                </tr>
              ))}
              {!filteredLedger.length && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400">
                    ไม่พบรายการค่าคอม
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

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'normal';
}) {
  const cls =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'bad'
          ? 'text-rose-700'
          : 'text-slate-950';
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <strong className={`mt-2 block text-xl font-black ${cls}`}>{value}</strong>
    </article>
  );
}
