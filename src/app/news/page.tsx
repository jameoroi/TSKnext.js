import type { Metadata } from 'next';
import Link from 'next/link';
import { safePublicLegacy } from '@/server/public-legacy-cache';

export const metadata: Metadata = {
  title: 'ข่าวสารและบทความ | THAISERKIT SUPPLY',
  description: 'ข่าวสาร โปรโมชัน และบทความความรู้จาก THAISERKIT SUPPLY',
};

const KIND_LABEL: Record<string, string> = { news: 'ข่าวสาร', article: 'บทความ', video: 'วิดีโอ' };

function thaiDate(value: unknown) {
  const d = new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

type ContentRow = Record<string, unknown>;

export default async function NewsPage() {
  const [n, a] = await Promise.all([
    safePublicLegacy<{ items?: ContentRow[] }>('content.list', { kind: 'news' }, { items: [] }),
    safePublicLegacy<{ items?: ContentRow[] }>('content.list', { kind: 'article' }, { items: [] }),
  ]);
  const rows = [...(n.items || []), ...(a.items || [])]
    .filter((x): x is ContentRow => Boolean(x && typeof x === 'object'))
    .sort((x, y) =>
      String(y.published_at || y.created_at || '').localeCompare(
        String(x.published_at || x.created_at || ''),
      ),
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">NEWS & ARTICLES</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ข่าวสารและบทความ</h1>
      <p className="mt-2 text-sm text-slate-500">อัปเดตโปรโมชัน ข่าวสินค้า และเนื้อหาความรู้จาก THAISERKIT SUPPLY</p>

      <div className="mt-6 grid gap-4">
        {rows.map((x, i) => {
          const kind = String(x.kind || 'article');
          const date = thaiDate(x.published_at || x.created_at);
          const img = String(x.image_url || x.cover_url || '');
          const title = String(x.title || x.name || 'บทความ');
          const excerpt = String(x.excerpt || x.summary || x.body || '');
          const url = String(x.url || '');
          return (
            <article
              key={String(x.id || `${kind}-${i}`)}
              className="flex gap-4 rounded-2xl border bg-white p-4 shadow-sm tsk-pop sm:gap-5 sm:p-5"
            >
              <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-52">
                {img ? (
                  // รูปจาก CMS อาจเป็น CDN/data URL ใด ๆ — ใช้ img ธรรมดาตามสัญญาเดิมของหลังบ้าน
                  // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center p-2 text-center text-[11px] font-bold text-slate-400">
                    ARTICLE_IMAGE — รอรูปจากระบบหลังบ้าน
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold uppercase tracking-wide text-emerald-800">
                    {KIND_LABEL[kind] || kind.toUpperCase()}
                  </span>
                  {date && <time className="shrink-0 text-slate-400">{date}</time>}
                </p>
                <h2 className="mt-2 line-clamp-2 font-bold leading-7">{title}</h2>
                {excerpt && <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-500">{excerpt}</p>}
                {url ? (
                  <Link href={url} className="mt-2 inline-block text-sm font-bold text-emerald-800 tsk-link">
                    อ่านเพิ่มเติม →
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
        {!rows.length && (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <h2 className="font-bold">ยังไม่มีข่าวสารตอนนี้</h2>
            <p className="mt-1 text-sm text-slate-500">บทความจะแสดงที่นี่อัตโนมัติเมื่อมีข้อมูลจากระบบหลังบ้าน</p>
            <Link
              href="/products"
              className="mt-5 inline-block rounded-xl bg-emerald-950 px-6 py-3 text-sm font-bold text-white"
            >
              เลือกซื้อสินค้า
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
