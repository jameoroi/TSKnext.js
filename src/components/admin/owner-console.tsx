'use client';

import { AlertTriangle, ArchiveRestore, CheckCircle2, DatabaseBackup, Download, RefreshCcw, ServerCog, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { MetricGrid } from '@/components/admin/page-header';
import { AdminDataTable } from '@/components/admin/data-table';

type Row = Record<string, any>;

const BACKUP_SECTIONS = ['products', 'indexes', 'settings', 'customers', 'reviews', 'returns', 'admins'] as const;

function message(error: unknown) {
  return error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function OwnerConsole({ initialMetrics, initialIntegrity, initialProduction, csrf }: { initialMetrics: Row; initialIntegrity: Row; initialProduction: Row; csrf: string }) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [integrity, setIntegrity] = useState(initialIntegrity);
  const [production, setProduction] = useState(initialProduction);
  const [errors, setErrors] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');

  async function refresh() {
    setBusy('refresh'); setError('');
    try {
      const [m, i, p, e] = await Promise.all([
        legacyRequest<Row>('admin.dashboard.metrics'),
        legacyRequest<Row>('admin.catalog.integrity'),
        legacyRequest<Row>('admin.production.status'),
        legacyRequest<Row>('admin.errors.list', { limit: 50 }),
      ]);
      setMetrics(m.metrics || m);
      setIntegrity(i);
      setProduction(p);
      setErrors(Array.isArray(e.errors) ? e.errors : []);
      setNotice('รีเฟรชสถานะระบบแล้ว');
    } catch (err) {
      setError(`รีเฟรชไม่สำเร็จ: ${message(err)}`);
    } finally { setBusy(''); }
  }

  async function exportBackup() {
    setBusy('backup'); setError(''); setNotice('กำลังสร้าง Backup…');
    try {
      // Small tenants can still finish in one call. That path also updates
      // backup-meta on the legacy engine, so use it first when possible.
      try {
        const whole = await legacyRequest<Row>('admin.backup.export');
        if (whole.backup && whole.next_offset == null) {
          const stamp = String(whole.backup.created_at || new Date().toISOString()).replace(/[:.]/g, '-');
          downloadJson(whole.backup, `thaiserkit-backup-${stamp}.json`);
          setNotice('สร้าง Backup แบบเต็มและดาวน์โหลดแล้ว');
          return;
        }
      } catch {
        // Large catalogues may exceed a single worker request. Continue with
        // the bounded section/page protocol implemented by the legacy engine.
      }

      const assembled: Row = { version: 1, created_at: new Date().toISOString(), data: {}, auth: {} };
      let pages = 0;
      for (const section of BACKUP_SECTIONS) {
        let offset = 0;
        while (true) {
          const part = await legacyRequest<Row>('admin.backup.export', { section, offset, limit: 40 });
          if (!part.backup || part.backup.version !== 1) throw new Error(`invalid_backup_part:${section}:${offset}`);
          if (pages === 0 && part.backup.created_at) assembled.created_at = part.backup.created_at;
          Object.assign(assembled.data, part.backup.data || {});
          Object.assign(assembled.auth, part.backup.auth || {});
          pages += 1;
          setNotice(`กำลังสร้าง Backup · ${section} · page ${pages}`);
          if (part.next_offset == null) break;
          offset = Number(part.next_offset);
          if (!Number.isFinite(offset) || offset < 0 || pages > 20_000) throw new Error('backup_pagination_invalid');
        }
      }
      const stamp = String(assembled.created_at).replace(/[:.]/g, '-');
      downloadJson(assembled, `thaiserkit-backup-${stamp}.json`);
      setNotice(`สร้าง Backup แบบแบ่งหน้าเสร็จแล้ว (${pages} requests)`);
    } catch (err) {
      setError(`สร้าง Backup ไม่สำเร็จ: ${message(err)}`);
      setNotice('');
    } finally { setBusy(''); }
  }

  async function restoreBackup() {
    if (!restoreFile || restoreConfirm !== 'RESTORE') return;
    if (!window.confirm('การ Restore จะเขียนทับข้อมูลที่อยู่ในไฟล์ Backup ลงระบบปัจจุบัน ยืนยันอีกครั้ง?')) return;
    setBusy('restore'); setError(''); setNotice('กำลังตรวจไฟล์ Backup…');
    try {
      const backup = JSON.parse(await restoreFile.text());
      if (!backup || backup.version !== 1 || typeof backup.data !== 'object') throw new Error('invalid_backup_file');
      const result = await legacyRequest<Row>('admin.backup.restore', { backup, csrf }, 'POST');
      setNotice(`Restore สำเร็จ ${Number(result.restored || 0).toLocaleString('th-TH')} records`);
      setRestoreConfirm(''); setRestoreFile(null);
      await refresh();
    } catch (err) {
      setError(`Restore ไม่สำเร็จ: ${message(err)}`);
    } finally { setBusy(''); }
  }

  const checks = production.checks && typeof production.checks === 'object' ? Object.entries(production.checks) : [];
  const integrityStatus = String(integrity.status || 'unknown');

  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-bold"><RefreshCcw size={16} className={busy === 'refresh' ? 'animate-spin' : ''}/>รีเฟรชสถานะ</button><button type="button" disabled={Boolean(busy)} onClick={() => void exportBackup()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white"><Download size={16}/>{busy === 'backup' ? 'กำลัง Backup…' : 'Backup ทั้งระบบ'}</button></div>
    {notice && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}

    <MetricGrid metrics={metrics}/>

    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Production readiness</p><h2 className="mt-1 text-xl font-black">System Health</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-black">{Number(production.score || 0)}%</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{checks.map(([key, value]) => <div key={key} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">{value ? <CheckCircle2 size={18} className="text-emerald-600"/> : <XCircle size={18} className="text-rose-600"/>}<div><strong className="block text-sm">{key.replaceAll('_', ' ')}</strong><span className="text-[10px] text-slate-500">{value ? 'พร้อมใช้งาน' : 'ต้องตรวจสอบ'}</span></div></div>)}</div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p className="rounded-xl border p-3"><b>Last backup:</b> {String(production.last_backup_at || 'ยังไม่มี')}</p><p className="rounded-xl border p-3"><b>Backup age:</b> {production.backup_age_days == null ? '—' : `${production.backup_age_days} วัน`}</p><p className="rounded-xl border p-3"><b>Storage:</b> {String(production.storage_backend || production.storage || '—')}</p><p className="rounded-xl border p-3"><b>Origin:</b> {String(production.origin || '—')}</p></div></section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-xl ${integrityStatus === 'healthy' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><ShieldCheck size={22}/></span><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Catalog integrity</p><h2 className="text-xl font-black">{integrityStatus}</h2></div></div><dl className="mt-5 space-y-2 text-sm">{Object.entries(integrity.products || {}).map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-b py-2"><dt className="text-slate-500">{key.replaceAll('_', ' ')}</dt><dd className="font-black">{String(value ?? '—')}</dd></div>)}<div className="flex justify-between gap-4 border-b py-2"><dt className="text-slate-500">database status</dt><dd className="font-black">{String(integrity.database_status || '—')}</dd></div><div className="flex justify-between gap-4 py-2"><dt className="text-slate-500">checked at</dt><dd className="font-black">{String(integrity.checked_at || '—')}</dd></div></dl></section>
    </div>

    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/30 shadow-sm"><div className="border-b border-amber-200 bg-amber-50 p-5"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><ArchiveRestore size={22}/></span><div><h2 className="font-black text-amber-950">Disaster Recovery</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-amber-900/70">Restore ใช้เฉพาะ Super Admin และมี CSRF protection ระบบรับเฉพาะ key ที่อยู่ใน allowlist ของ backend เดิม แต่การเขียนทับข้อมูลยังเป็นงานที่มีผลจริง ควร Backup ปัจจุบันก่อนทุกครั้ง</p></div></div></div><div className="grid gap-4 p-5 lg:grid-cols-[1fr_220px_auto]"><label className="text-xs font-bold text-slate-600">ไฟล์ Backup JSON<input type="file" accept="application/json,.json" onChange={(event) => setRestoreFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-xl border bg-white p-2 text-sm"/></label><label className="text-xs font-bold text-slate-600">พิมพ์ RESTORE เพื่อยืนยัน<input value={restoreConfirm} onChange={(event) => setRestoreConfirm(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm font-black"/></label><button type="button" disabled={busy === 'restore' || !restoreFile || restoreConfirm !== 'RESTORE'} onClick={() => void restoreBackup()} className="self-end inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-black text-white disabled:opacity-40"><Upload size={16}/>{busy === 'restore' ? 'กำลัง Restore…' : 'Restore Backup'}</button></div></section>

    <div className="grid gap-6 xl:grid-cols-2"><AdminDataTable title="Production status raw" rows={[production]}/><AdminDataTable title="Catalog integrity raw" rows={[integrity]}/></div>

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-700"><AlertTriangle size={19}/></span><div><h2 className="font-black">Recent Failures</h2><p className="text-xs text-slate-500">โหลดเมื่อกดรีเฟรชสถานะ · สูงสุด 50 รายการล่าสุด</p></div></div>{errors.length ? <div className="mt-4"><AdminDataTable title="Error log" rows={errors}/></div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">ยังไม่ได้โหลด error log หรือไม่มี failure ล่าสุด</p>}</section>

    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><DatabaseBackup className="text-emerald-800"/><strong className="mt-3 block">Backup</strong><p className="mt-1 text-xs leading-5 text-slate-500">รองรับ full export และ fallback เป็น section/page สำหรับ catalogue ใหญ่</p></div><div className="rounded-2xl border bg-white p-5"><ServerCog className="text-emerald-800"/><strong className="mt-3 block">Readiness</strong><p className="mt-1 text-xs leading-5 text-slate-500">ตรวจ API, storage, database, payment, email, HTTPS, policy และ backup freshness</p></div><div className="rounded-2xl border bg-white p-5"><ShieldCheck className="text-emerald-800"/><strong className="mt-3 block">Super Admin only</strong><p className="mt-1 text-xs leading-5 text-slate-500">งาน Owner ถูกป้องกันทั้ง route guard และ permission layer ใน API</p></div></section>
  </div>;
}
