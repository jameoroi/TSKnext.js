'use client';

import { useState } from 'react';
import { scaleImageFile, uploadAdminImage } from '@/lib/admin-media.client';
import { legacyRequest } from '@/lib/legacy-api.client';

export type BannerRow = { id?: string; img: string; link_url: string; alt_text: string; active: boolean };

export type BannerListMeta = {
  /** Site settings key the list is saved under, e.g. `page_banners_products`. */
  key: string;
  ownerType: string;
  title: string;
  /** Where it shows on the shop. */
  note: string;
  /** Upload size, matched to the frame the shop draws. */
  size: string;
  /** CSS aspect-ratio of that frame, e.g. `12 / 5`. */
  ratio: string;
  maxEdge?: number;
  defaultLink?: string;
};

export function normalizeBannerRows(value: unknown): BannerRow[] {
  return (Array.isArray(value) ? value : []).map((row: any) => ({
    id: row?.id,
    img: row?.img || row?.image_url || '',
    link_url: row?.link_url || '',
    alt_text: row?.alt_text || '',
    active: row?.active !== false,
  }));
}

/**
 * Several pictures for one banner, saved straight to site settings.
 *
 * The shop shows every active picture in order as an auto-sliding carousel.
 * Uploads go to managed media (never base64 in settings), and every change is
 * saved on the spot so an admin cannot leave the page with pictures uploaded
 * but not attached.
 */
export function BannerListEditor({
  meta,
  initialRows,
  csrf,
}: {
  meta: BannerListMeta;
  initialRows: unknown;
  csrf: string;
}) {
  const [rows, setRows] = useState<BannerRow[]>(() => normalizeBannerRows(initialRows));
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  async function save(next: BannerRow[], message = 'บันทึกแบนเนอร์แล้ว') {
    setBusy('save');
    setNotice(null);
    try {
      const clean = next
        .filter((row) => Boolean(row.img))
        .map((row) => ({ ...row, active: row.active !== false }));
      const response = await legacyRequest<any>('admin.site.settings', { [meta.key]: clean, csrf }, 'POST');
      setRows(normalizeBannerRows(response?.settings?.[meta.key] ?? clean));
      setNotice({ kind: 'ok', text: message });
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'save_failed' });
    } finally {
      setBusy('');
    }
  }

  async function upload(files: File[], replaceIndex?: number) {
    if (!files.length) return;
    setBusy(replaceIndex === undefined ? 'upload' : `upload-${replaceIndex}`);
    setNotice(null);
    try {
      const urls: string[] = [];
      for (const file of files) {
        const prepared = await scaleImageFile(file, meta.maxEdge || 2800);
        urls.push(await uploadAdminImage(prepared, { ownerType: meta.ownerType, csrf }));
      }
      const next =
        replaceIndex === undefined
          ? [
              ...rows,
              ...urls.map((img) => ({ img, link_url: meta.defaultLink || '', alt_text: '', active: true })),
            ]
          : rows.map((row, i) => (i === replaceIndex ? { ...row, img: urls[0] || row.img } : row));
      setRows(next);
      await save(next, 'อัปโหลดและบันทึกแล้ว');
    } catch (error) {
      setNotice({
        kind: 'bad',
        text: `อัปโหลดไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}`,
      });
      setBusy('');
    }
  }

  const update = (index: number, patch: Partial<BannerRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setRows(next);
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{meta.title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{meta.note}</p>
          <p className="mt-1 text-xs font-semibold text-emerald-800">{meta.size}</p>
          <p className="mt-0.5 text-xs text-slate-500">ใส่ได้หลายรูป — หน้าร้านเลื่อนอัตโนมัติไปทางขวาแบบสมูท</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">
            {busy === 'upload' ? 'กำลังอัปโหลด…' : '+ เพิ่มรูป (เลือกได้หลายรูป)'}
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const files = Array.from(e.target.files || []) as File[];
                e.currentTarget.value = '';
                void upload(files);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void save(rows, 'บันทึกลำดับและข้อความแล้ว')}
            disabled={Boolean(busy)}
            className="rounded-xl bg-emerald-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกลำดับ/ข้อความ'}
          </button>
        </div>
      </div>
      {notice && (
        <p
          className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {notice.text}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
          ยังไม่มีรูป — หน้าร้านจะแสดงพื้นสีเขียวของธีมแทน
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((row, index) => (
            <article
              key={`${row.id || 'new'}-${index}`}
              className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[200px_1fr_auto]"
            >
              <div
                className="overflow-hidden rounded-lg bg-slate-100"
                style={{ aspectRatio: meta.ratio }}
                title="ตัวอย่างนี้ครอปเหมือนหน้าร้านจริง"
              >
                {row.img ? (
                  // biome-ignore lint/performance/noImgElement: admin preview of an uploaded URL
                  <img
                    src={row.img}
                    alt={row.alt_text || meta.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-content-center text-xs text-slate-400">ยังไม่มีรูป</div>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">เปลี่ยนรูป</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    disabled={Boolean(busy)}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = '';
                      if (file) void upload([file], index);
                    }}
                    className="rounded-lg border p-2 text-xs"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">ลิงก์เมื่อคลิก (ไม่ใส่ก็ได้)</span>
                  <input
                    value={row.link_url}
                    onChange={(e) => update(index, { link_url: e.target.value })}
                    className="rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">คำอธิบายรูป (Alt)</span>
                  <input
                    value={row.alt_text}
                    onChange={(e) => update(index, { alt_text: e.target.value })}
                    className="rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(e) => update(index, { active: e.target.checked })}
                  />
                  <span className="font-semibold">แสดงบนหน้าร้าน</span>
                </label>
              </div>
              <div className="flex gap-2 lg:flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-30"
                  aria-label="เลื่อนขึ้น"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-30"
                  aria-label="เลื่อนลง"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void save(
                      rows.filter((_, i) => i !== index),
                      'ลบรูปแล้ว',
                    )
                  }
                  disabled={Boolean(busy)}
                  className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-700 disabled:opacity-30"
                >
                  ลบ
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
