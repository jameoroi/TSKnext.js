'use client';

import { RefreshCcw, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

function message(error: unknown) {
  const code =
    error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  return (
    (
      {
        unauthorized: 'ไม่มีสิทธิ์ดำเนินการ',
        invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
      } as Record<string, string>
    )[code] || code
  );
}

export function BrandMaintenance({ csrf }: { csrf: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function migrate() {
    if (!window.confirm('ให้ระบบไล่ผูกสินค้าที่ Brand ID หาย โดยเทียบชื่อ/alias กับ Brand Master?')) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const out = await legacyRequest<any>('admin.brands.migrate_products', { csrf }, 'POST');
      setNotice(
        `ตรวจ ${Number(out.total || 0).toLocaleString('th-TH')} สินค้า · ผูกเพิ่ม ${Number(out.linked || 0).toLocaleString('th-TH')} · เดิมถูกต้อง ${Number(out.already || 0).toLocaleString('th-TH')} · หาแบรนด์ไม่เจอ ${Number(out.unmatched || 0).toLocaleString('th-TH')}`,
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black">Brand Master Maintenance</h2>
          <p className="mt-1 text-xs text-slate-500">
            เรียงลำดับแบรนด์ในตารางด้านล่าง และซ่อม product → brand_id จากชื่อ/alias เมื่อข้อมูล import เก่ายังไม่ได้ link
          </p>
        </div>
        <button
          type="button"
          onClick={() => void migrate()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black"
        >
          <WandSparkles size={14} />
          {busy ? 'กำลังตรวจ…' : 'Link สินค้ากับ Brand Master'}
        </button>
      </div>
      {notice && (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
          <RefreshCcw size={13} className="mr-1 inline" />
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
