'use client';

import { useMemo, useState } from 'react';
import { scaleImageFile, uploadAdminImage } from '@/lib/admin-media.client';
import { legacyRequest } from '@/lib/legacy-api.client';

type ContentKind = 'news' | 'article' | 'video';
type BannerKind =
  | 'banners'
  | 'promo_banners'
  | 'article_banners'
  | 'flash_sale_backgrounds'
  | 'dealer_backgrounds';
type Tab = 'banner' | 'banner-promo' | 'banner-article' | 'bg-flash' | 'bg-dealer' | ContentKind;
type Banner = { id?: string; img: string; link_url: string; alt_text: string; active: boolean };
type Item = Record<string, any>;

const tabs: Array<{ key: Tab; label: string; note: string }> = [
  { key: 'banner', label: 'สไลด์ใหญ่', note: 'ภาพ Hero ด้านบนหน้าแรก' },
  { key: 'banner-promo', label: 'แบนเนอร์ย่อย', note: 'ภาพแถวใต้ Hero' },
  { key: 'banner-article', label: 'แบนเนอร์บทความ', note: 'แถบกว้างเหนือบทความท้ายหน้าแรก' },
  {
    key: 'bg-flash',
    label: 'พื้นหลัง Flash Sale',
    note: 'รูปเต็มกล่อง Flash Sale หน้าแรก (ใช้รูปแรกที่เปิดอยู่)',
  },
  {
    key: 'bg-dealer',
    label: 'พื้นหลังสมัครตัวแทน',
    note: 'รูปเต็มกล่องสมัครตัวแทนหน้าแรก (ใช้รูปแรกที่เปิดอยู่)',
  },
  { key: 'news', label: 'ข่าวสารและโปรโมชั่น', note: 'ข่าวและประกาศบนหน้าร้าน' },
  { key: 'article', label: 'บทความ', note: 'บทความความรู้และ SEO content' },
  { key: 'video', label: 'วิดีโอ', note: 'วิดีโอพร้อมภาพปกและ URL' },
];

function normalizeBanners(value: any): Banner[] {
  return (Array.isArray(value) ? value : []).map((row: any) => ({
    id: row.id,
    img: row.img || row.image_url || '',
    link_url: row.link_url || '',
    alt_text: row.alt_text || '',
    active: row.active !== false,
  }));
}

const blankItem = (): Item => ({
  id: '',
  title: '',
  excerpt: '',
  body: '',
  image_url: '',
  video_url: '',
  link_url: '',
  published: true,
  sort_order: 0,
});

export function ContentManager({
  initialSettings,
  initialItems,
  csrf,
}: {
  initialSettings: Record<string, any>;
  initialItems: Record<ContentKind, Item[]>;
  csrf: string;
}) {
  const [tab, setTab] = useState<Tab>('banner');
  const [settings, setSettings] = useState(initialSettings || {});
  const [itemsByKind, setItemsByKind] = useState<Record<ContentKind, Item[]>>(initialItems);
  const [form, setForm] = useState<Item>(blankItem());
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [uploading, setUploading] = useState('');

  const active = tabs.find((x) => x.key === tab)!;
  const contentKind = ['news', 'article', 'video'].includes(tab) ? (tab as ContentKind) : null;
  const currentItems = contentKind ? itemsByKind[contentKind] || [] : [];

  const bannerMeta = useMemo(
    () => ({
      banner: {
        key: 'banners' as BannerKind,
        ownerType: 'site-banner',
        maxEdge: 2800,
        defaultLink: '/products',
        title: 'สไลด์ใหญ่',
        size: 'ขนาดที่ต้องใส่ 2800 × 1167 px (12:5) — หน้าร้านแสดงเต็มกรอบอัตราส่วนเดียวกันทุกหน้าจอ',
        ratio: '12 / 5',
      },
      'banner-promo': {
        key: 'promo_banners' as BannerKind,
        ownerType: 'site-promo-banner',
        maxEdge: 2800,
        defaultLink: '/products',
        title: 'แบนเนอร์ย่อยใต้สไลด์',
        size: 'ขนาดที่ต้องใส่ 2800 × 1167 px (12:5) — กรอบหน้าร้านขนาดเดียวกัน',
        ratio: '12 / 5',
      },
      'banner-article': {
        key: 'article_banners' as BannerKind,
        ownerType: 'site-article-banner',
        maxEdge: 2800,
        defaultLink: '/news',
        title: 'แบนเนอร์คั่นบทความ',
        size: 'ขนาดที่ต้องใส่ 2800 × 467 px (6:1) — ยาวเต็มความกว้างเท่ากล่อง Flash Sale',
        ratio: '6 / 1',
      },
      'bg-flash': {
        key: 'flash_sale_backgrounds' as BannerKind,
        ownerType: 'site-flash-background',
        maxEdge: 2800,
        defaultLink: '',
        title: 'พื้นหลังกล่อง Flash Sale',
        size: 'ขนาดที่ต้องใส่ 2800 × 1080 px (≈2.6:1) — ข้อความ Flash Sale อยู่ซ้าย สินค้าอยู่ขวา · มือถือจะครอปกลางภาพ',
        ratio: '2800 / 1080',
      },
      'bg-dealer': {
        key: 'dealer_backgrounds' as BannerKind,
        ownerType: 'site-dealer-background',
        maxEdge: 2800,
        defaultLink: '',
        title: 'พื้นหลังกล่องสมัครตัวแทน',
        size: 'ขนาดที่ต้องใส่ 2800 × 1400 px (2:1) — ข้อความอยู่ซ้าย ฟอร์มอยู่ขวา · มือถือจะครอปกลางภาพ',
        ratio: '2 / 1',
      },
    }),
    [],
  );

  const currentBannerMeta = contentKind ? null : bannerMeta[tab as keyof typeof bannerMeta];
  const banners = currentBannerMeta ? normalizeBanners(settings[currentBannerMeta.key]) : [];

  function setBannerRows(key: BannerKind, rows: Banner[]) {
    setSettings((current) => ({ ...current, [key]: rows }));
  }

  async function run(key: string, success: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: 'ok', text: success });
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'operation_failed' });
    } finally {
      setBusy('');
    }
  }

  async function saveBanners(meta: NonNullable<typeof currentBannerMeta>, rows: Banner[]) {
    await run(`save-${meta.key}`, 'บันทึกแบนเนอร์แล้ว', async () => {
      const clean = rows
        .filter((row) => Boolean(row.img))
        .map((row) => ({ ...row, active: row.active !== false }));
      const response = await legacyRequest<any>('admin.site.settings', { [meta.key]: clean, csrf }, 'POST');
      setSettings((current) => ({
        ...current,
        ...(response?.settings || {}),
        [meta.key]: normalizeBanners(response?.settings?.[meta.key] ?? clean),
      }));
    });
  }

  async function uploadBanner(meta: NonNullable<typeof currentBannerMeta>, index: number, file: File) {
    setUploading(`${meta.key}-${index}`);
    setNotice(null);
    try {
      const prepared = await scaleImageFile(file, meta.maxEdge);
      const url = await uploadAdminImage(prepared, { ownerType: meta.ownerType, csrf });
      const next = banners.map((row, i) => (i === index ? { ...row, img: url } : row));
      setBannerRows(meta.key, next);
      await saveBanners(meta, next);
    } catch (error) {
      setNotice({
        kind: 'bad',
        text: `อัปโหลดไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}`,
      });
    } finally {
      setUploading('');
    }
  }

  async function addMany(meta: NonNullable<typeof currentBannerMeta>, files: File[]) {
    if (!files.length) return;
    setUploading(`many-${meta.key}`);
    setNotice(null);
    try {
      const added: Banner[] = [];
      for (const file of files) {
        const prepared = await scaleImageFile(file, meta.maxEdge);
        const url = await uploadAdminImage(prepared, { ownerType: meta.ownerType, csrf });
        added.push({ img: url, link_url: meta.defaultLink, alt_text: '', active: true });
      }
      const next = [...banners, ...added];
      setBannerRows(meta.key, next);
      await saveBanners(meta, next);
    } catch (error) {
      setNotice({
        kind: 'bad',
        text: `อัปโหลดไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}`,
      });
    } finally {
      setUploading('');
    }
  }

  function moveBanner(meta: NonNullable<typeof currentBannerMeta>, index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= banners.length) return;
    const next = [...banners];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    setBannerRows(meta.key, next);
  }

  async function removeBanner(meta: NonNullable<typeof currentBannerMeta>, index: number) {
    const next = banners.filter((_, i) => i !== index);
    setBannerRows(meta.key, next);
    await saveBanners(meta, next);
  }

  async function refreshContent(kind: ContentKind) {
    const response = await legacyRequest<any>('admin.content.list', { kind });
    setItemsByKind((current) => ({ ...current, [kind]: response?.items || [] }));
  }

  function startNew() {
    setForm(blankItem());
    setShowForm(true);
  }
  function edit(item: Item) {
    setForm({
      ...blankItem(),
      ...item,
      published: item.published !== false,
      sort_order: Number(item.sort_order || 0),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function uploadCover(file: File) {
    setUploading('content-cover');
    setNotice(null);
    try {
      const prepared = await scaleImageFile(file, 1600);
      const url = await uploadAdminImage(prepared, {
        ownerType: 'content-cover',
        ownerId: String(form.id || ''),
        csrf,
      });
      setForm((current) => ({ ...current, image_url: url }));
    } catch (error) {
      setNotice({
        kind: 'bad',
        text: `อัปโหลดภาพปกไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}`,
      });
    } finally {
      setUploading('');
    }
  }

  async function saveItem() {
    if (!contentKind || !String(form.title || '').trim()) return;
    await run('item', form.id ? 'บันทึกเนื้อหาแล้ว' : 'เพิ่มเนื้อหาแล้ว', async () => {
      await legacyRequest('admin.content.save', { ...form, kind: contentKind, csrf }, 'POST');
      await refreshContent(contentKind);
      setShowForm(false);
      setForm(blankItem());
    });
  }

  async function removeItem(item: Item) {
    if (!contentKind || !window.confirm(`ลบ “${item.title || item.id}”?`)) return;
    await run(`delete-${item.id}`, 'ลบเนื้อหาแล้ว', async () => {
      await legacyRequest('admin.content.delete', { kind: contentKind, id: item.id, csrf }, 'POST');
      await refreshContent(contentKind);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setTab(item.key);
              setShowForm(false);
            }}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${tab === item.key ? 'bg-emerald-950 text-white' : 'border bg-white text-slate-700'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {notice && (
        <p
          className={`rounded-2xl border p-4 text-sm font-semibold ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {notice.text}
        </p>
      )}

      {currentBannerMeta ? (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{currentBannerMeta.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {active.note} · {currentBannerMeta.size}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold">
                {uploading === `many-${currentBannerMeta.key}` ? 'กำลังอัปโหลด…' : '+ หลายรูป'}
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []) as File[];
                    e.currentTarget.value = '';
                    void addMany(currentBannerMeta, files);
                  }}
                />
              </label>
              <button
                onClick={() =>
                  setBannerRows(currentBannerMeta.key, [
                    ...banners,
                    { img: '', link_url: currentBannerMeta.defaultLink, alt_text: '', active: true },
                  ])
                }
                className="rounded-xl border px-3 py-2 text-sm font-bold"
              >
                + เพิ่มทีละรูป
              </button>
              <button
                onClick={() => saveBanners(currentBannerMeta, banners)}
                disabled={busy === `save-${currentBannerMeta.key}`}
                className="rounded-xl bg-emerald-950 px-3 py-2 text-sm font-bold text-white"
              >
                บันทึกลำดับ/ข้อความ
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            {banners.map((banner, index) => (
              <article
                key={`${banner.id || 'new'}-${index}`}
                className="grid gap-4 rounded-2xl border p-4 xl:grid-cols-[180px_1fr_auto]"
              >
                <div
                  className="overflow-hidden rounded-xl bg-slate-100"
                  style={{ aspectRatio: currentBannerMeta.ratio }}
                  title="ตัวอย่างนี้ครอปเหมือนหน้าร้านจริง"
                >
                  {banner.img ? (
                    <img
                      src={banner.img}
                      alt={banner.alt_text || 'banner'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-content-center text-xs text-slate-400">ยังไม่มีรูป</div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">รูปภาพ</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (file) void uploadBanner(currentBannerMeta, index, file);
                      }}
                      disabled={uploading === `${currentBannerMeta.key}-${index}`}
                      className="rounded-xl border p-2 text-xs"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">ลิงก์เมื่อคลิก</span>
                    <input
                      value={banner.link_url}
                      onChange={(e) =>
                        setBannerRows(
                          currentBannerMeta.key,
                          banners.map((row, i) => (i === index ? { ...row, link_url: e.target.value } : row)),
                        )
                      }
                      className="rounded-xl border px-3 py-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm md:col-span-2">
                    <span className="font-semibold">Alt text</span>
                    <input
                      value={banner.alt_text}
                      onChange={(e) =>
                        setBannerRows(
                          currentBannerMeta.key,
                          banners.map((row, i) => (i === index ? { ...row, alt_text: e.target.value } : row)),
                        )
                      }
                      className="rounded-xl border px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={banner.active}
                      onChange={(e) =>
                        setBannerRows(
                          currentBannerMeta.key,
                          banners.map((row, i) => (i === index ? { ...row, active: e.target.checked } : row)),
                        )
                      }
                    />
                    <span className="font-semibold">แสดงบนหน้าแรก</span>
                  </label>
                </div>
                <div className="flex gap-2 xl:flex-col">
                  <button
                    onClick={() => moveBanner(currentBannerMeta, index, -1)}
                    disabled={index === 0}
                    className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveBanner(currentBannerMeta, index, 1)}
                    disabled={index === banners.length - 1}
                    className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeBanner(currentBannerMeta, index)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-700"
                  >
                    ลบ
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!banners.length && (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
              ยังไม่มีแบนเนอร์ในชุดนี้
            </p>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{active.label}</h2>
              <p className="text-sm text-slate-500">{active.note}</p>
            </div>
            <button
              onClick={startNew}
              className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white"
            >
              + เพิ่มรายการ
            </button>
          </div>
          {showForm && (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="font-bold">
                {form.id ? 'แก้ไข' : 'เพิ่ม'} {active.label}
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm md:col-span-2">
                  <span className="font-semibold">หัวข้อ</span>
                  <input
                    value={form.title || ''}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm md:col-span-2">
                  <span className="font-semibold">คำโปรย</span>
                  <input
                    value={form.excerpt || ''}
                    onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm md:col-span-2">
                  <span className="font-semibold">ภาพปก</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = '';
                      if (file) void uploadCover(file);
                    }}
                    className="rounded-xl border p-2 text-xs"
                  />
                  {form.image_url && (
                    <img
                      src={form.image_url}
                      alt="preview"
                      className="mt-2 h-36 w-36 rounded-xl border object-contain"
                    />
                  )}
                </label>
                {contentKind === 'video' ? (
                  <label className="grid gap-1 text-sm md:col-span-2">
                    <span className="font-semibold">Video URL</span>
                    <input
                      value={form.video_url || ''}
                      onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                      type="url"
                      className="rounded-xl border px-3 py-2"
                    />
                  </label>
                ) : (
                  <label className="grid gap-1 text-sm md:col-span-2">
                    <span className="font-semibold">เนื้อหา</span>
                    <textarea
                      value={form.body || ''}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      rows={9}
                      className="rounded-xl border p-3"
                    />
                  </label>
                )}
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">ลิงก์เพิ่มเติม</span>
                  <input
                    value={form.link_url || ''}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">ลำดับ</span>
                  <input
                    value={Number(form.sort_order || 0)}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                    type="number"
                    min={0}
                    className="rounded-xl border px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.published !== false}
                    onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  />
                  <span className="font-semibold">เผยแพร่</span>
                </label>
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={saveItem}
                  disabled={busy === 'item' || uploading === 'content-cover'}
                  className="rounded-xl bg-emerald-950 px-4 py-2 font-bold text-white"
                >
                  {busy === 'item' ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
                <button onClick={() => setShowForm(false)} className="rounded-xl border px-4 py-2 font-bold">
                  ปิดฟอร์ม
                </button>
              </div>
            </section>
          )}
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            {currentItems.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="p-2">ภาพ</th>
                      <th className="p-2">หัวข้อ</th>
                      <th className="p-2">ลำดับ</th>
                      <th className="p-2">สถานะ</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.map((item) => (
                      <tr key={String(item.id)} className="border-b last:border-0">
                        <td className="p-2">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              className="h-12 w-20 rounded-lg object-contain"
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="p-2">
                          <strong>{item.title}</strong>
                          {item.excerpt && (
                            <small className="mt-1 block max-w-xl text-slate-500">{item.excerpt}</small>
                          )}
                        </td>
                        <td className="p-2">{item.sort_order || 0}</td>
                        <td className="p-2">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-bold ${item.published !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
                          >
                            {item.published !== false ? 'เผยแพร่' : 'ร่าง'}
                          </span>
                        </td>
                        <td className="p-2">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => edit(item)}
                              className="rounded-lg border px-2 py-1 text-xs font-bold"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => removeItem(item)}
                              disabled={busy === `delete-${item.id}`}
                              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-bold text-red-700"
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">ยังไม่มีรายการ</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
