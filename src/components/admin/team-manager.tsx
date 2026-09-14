'use client';

import { KeyRound, Plus, RefreshCcw, ShieldCheck, Trash2, UserRoundCheck, UserRoundX } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

type Row = Record<string, any>;
const ROLES = [
  { value: 'admin', label: 'Admin', note: 'สินค้า ออเดอร์ สต็อก และเนื้อหา' },
  { value: 'manager', label: 'Manager', note: 'งานร้านเกือบทั้งหมด ยกเว้นการเงิน/คีย์/บัญชีทีม' },
  { value: 'super_admin', label: 'Super Admin', note: 'สิทธิ์สูงสุด รวมการเงิน คีย์ และบัญชีทีม' },
];

function friendly(error: unknown) {
  const key =
    error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const messages: Record<string, string> = {
    invalid_input: 'ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัว ใช้ a-z/0-9/._- และรหัสผ่านอย่างน้อย 10 ตัว',
    weak_password: 'รหัสผ่านใหม่สั้นเกินไป',
    username_exists: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
    username_taken: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
    invalid_password: 'รหัสผ่านเดิมไม่ถูกต้อง',
    forbidden_super_admin_only: 'เฉพาะ Super Admin เท่านั้นที่จัดการบัญชีทีมได้',
    invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    not_found: 'ไม่พบบัญชีนี้',
    admin_not_configured: 'ยังไม่ได้ตั้งค่า Super Admin หลักบนเซิร์ฟเวอร์',
  };
  return messages[key] || key;
}

export function TeamManager({
  initialRows,
  allowed,
  role,
  csrf,
}: {
  initialRows: Row[];
  allowed: boolean;
  role: string;
  csrf: string;
}) {
  const [rows, setRows] = useState(initialRows || []);
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'admin' });
  const [own, setOwn] = useState({ old_password: '', new_password: '' });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const ownPasswordMin = role === 'super_admin' || role === 'manager' ? 14 : 10;

  function clear() {
    setNotice('');
    setError('');
  }

  async function reload() {
    if (!allowed) return;
    setBusy('reload');
    clear();
    try {
      const result = await legacyRequest<any>('admin.users.list');
      setRows(result.users || []);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy('create');
    clear();
    try {
      const result = await legacyRequest<any>('admin.users.create', { ...form, csrf }, 'POST');
      setRows((current) => [result.user, ...current]);
      setForm({ username: '', name: '', password: '', role: 'admin' });
      setNotice('สร้างบัญชีทีมงานแล้ว แนะนำให้ผู้ใช้เปลี่ยนรหัสผ่านหลังเข้าใช้งานครั้งแรก');
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function update(row: Row, patch: Row) {
    setBusy(`user:${row.id}`);
    clear();
    try {
      const result = await legacyRequest<any>('admin.users.update', { id: row.id, ...patch, csrf }, 'POST');
      setRows((current) =>
        current.map((item) => (String(item.id) === String(row.id) ? { ...item, ...result.user } : item)),
      );
      setNotice(`อัปเดตบัญชี ${row.username} แล้ว`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function resetPassword(row: Row) {
    const password = window.prompt(`ตั้งรหัสผ่านใหม่ให้ ${row.username}\nอย่างน้อย 10 ตัวอักษร`, '');
    if (password === null) return;
    if (password.length < 10) {
      setError('รหัสผ่านใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร');
      return;
    }
    await update(row, { password });
  }

  async function remove(row: Row) {
    if (!window.confirm(`ลบบัญชี ${row.username} ? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    setBusy(`user:${row.id}`);
    clear();
    try {
      await legacyRequest('admin.users.delete', { id: row.id, csrf }, 'POST');
      setRows((current) => current.filter((item) => String(item.id) !== String(row.id)));
      setNotice(`ลบบัญชี ${row.username} แล้ว`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function changeOwn(event: FormEvent) {
    event.preventDefault();
    if (own.new_password.length < ownPasswordMin) {
      setError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${ownPasswordMin} ตัวอักษร`);
      return;
    }
    setBusy('own');
    clear();
    try {
      await legacyRequest('admin.password', { ...own, csrf }, 'POST');
      setOwn({ old_password: '', new_password: '' });
      setNotice('เปลี่ยนรหัสผ่านของบัญชีปัจจุบันแล้ว');
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </p>
      )}

      {allowed ? (
        <>
          <form onSubmit={create} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Plus size={18} />
                </span>
                <div>
                  <h2 className="font-black">เพิ่มบัญชีทีมงาน</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    ใช้บัญชีแยกรายคนเพื่อให้ Audit Log ระบุผู้กระทำได้และปิดสิทธิ์เฉพาะคนได้
                  </p>
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
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">
                Username
                <input
                  required
                  minLength={3}
                  pattern="[a-zA-Z0-9_.-]{3,60}"
                  autoComplete="off"
                  value={form.username}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, username: event.target.value.toLowerCase() }))
                  }
                  className="mt-1 h-11 w-full rounded-xl border px-3 font-normal"
                  placeholder="employee.name"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                ชื่อที่แสดง
                <input
                  value={form.name}
                  maxLength={150}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="mt-1 h-11 w-full rounded-xl border px-3 font-normal"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                รหัสผ่านเริ่มต้น
                <input
                  required
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  className="mt-1 h-11 w-full rounded-xl border px-3 font-normal"
                />
                <span className="mt-1 block text-[10px] font-normal text-slate-400">อย่างน้อย 10 ตัวอักษร</span>
              </label>
              <label className="text-xs font-bold text-slate-600">
                Role
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  className="mt-1 h-11 w-full rounded-xl border bg-white px-3 font-normal"
                >
                  {ROLES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label} — {item.note}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.role === 'super_admin' && (
              <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-800">
                <strong>Super Admin</strong> เข้าถึงการเงิน คีย์ระบบ Backup/Restore และสร้าง Super Admin คนอื่นได้
                ให้สิทธิ์เฉพาะผู้ที่ไว้ใจเต็มที่
              </p>
            )}
            {form.role === 'manager' && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Manager ดูแลงานร้านได้เกือบทั้งหมด แต่ API จะบล็อกการเงิน คีย์ระบบ Backup/Restore และการจัดการบัญชีทีม
              </p>
            )}
            <button
              disabled={busy === 'create'}
              className="mt-4 rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              {busy === 'create' ? 'กำลังเพิ่ม…' : 'สร้างบัญชี'}
            </button>
          </form>

          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b p-5">
              <div>
                <h2 className="font-black">บัญชีผู้ดูแล</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {rows.length.toLocaleString('th-TH')} บัญชี · สิทธิ์ถูกบังคับซ้ำที่ API
                </p>
              </div>
              <ShieldCheck size={20} className="text-emerald-700" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">ชื่อ</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">สร้างเมื่อ</th>
                    <th className="px-4 py-3 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-3">
                        <code className="text-xs">{row.username}</code>
                      </td>
                      <td className="px-4 py-3 font-bold">{row.name || '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          disabled={busy === `user:${row.id}`}
                          value={row.role || 'admin'}
                          onChange={(event) => void update(row, { role: event.target.value })}
                          className="rounded-lg border bg-white px-2 py-1.5 text-xs font-bold"
                        >
                          {ROLES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${row.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {row.active !== false ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString('th-TH') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={busy === `user:${row.id}`}
                            onClick={() => void update(row, { active: row.active === false })}
                            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold"
                          >
                            {row.active !== false ? <UserRoundX size={13} /> : <UserRoundCheck size={13} />}{' '}
                            {row.active !== false ? 'ปิด' : 'เปิด'}
                          </button>
                          <button
                            type="button"
                            disabled={busy === `user:${row.id}`}
                            onClick={() => void resetPassword(row)}
                            className="rounded-lg border p-2"
                            title="ตั้งรหัสผ่านใหม่"
                          >
                            <KeyRound size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={busy === `user:${row.id}`}
                            onClick={() => void remove(row)}
                            className="rounded-lg border p-2 text-rose-700"
                            title="ลบบัญชี"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400">
                        ยังไม่มีบัญชีทีมงาน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          ส่วนจัดการบัญชีทีมต้องใช้ <strong>Super Admin</strong> บัญชีปัจจุบันยังสามารถเปลี่ยนรหัสผ่านของตัวเองด้านล่างได้
        </p>
      )}

      <form onSubmit={changeOwn} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <KeyRound size={18} />
          </span>
          <div>
            <h2 className="font-black">เปลี่ยนรหัสผ่านของฉัน</h2>
            <p className="text-xs text-slate-500">
              Role ปัจจุบัน: {role || 'admin'} · ขั้นต่ำ {ownPasswordMin} ตัวอักษร
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            required
            type="password"
            autoComplete="current-password"
            value={own.old_password}
            onChange={(event) => setOwn((current) => ({ ...current, old_password: event.target.value }))}
            className="h-11 rounded-xl border px-3 text-sm"
            placeholder="รหัสผ่านเดิม"
          />
          <input
            required
            type="password"
            minLength={ownPasswordMin}
            autoComplete="new-password"
            value={own.new_password}
            onChange={(event) => setOwn((current) => ({ ...current, new_password: event.target.value }))}
            className="h-11 rounded-xl border px-3 text-sm"
            placeholder={`รหัสผ่านใหม่ ≥ ${ownPasswordMin} ตัว`}
          />
          <button
            disabled={busy === 'own'}
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-black text-white"
          >
            {busy === 'own' ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </div>
      </form>
    </div>
  );
}
