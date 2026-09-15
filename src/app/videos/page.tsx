import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero } from '@/components/content/page-hero';
import { safePublicLegacy } from '@/server/public-legacy-cache';

export const metadata: Metadata = {
  title: 'วิดีโอสินค้า',
  description: 'วิดีโอแนะนำและสาธิตการใช้งานเครื่องมือจาก THAISERKIT SUPPLY',
};

function youtubeId(raw: unknown): string {
  const url = String(raw || '').trim();
  if (!url) return '';
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{6,}$/.test(url)) return url;
  return '';
}

export default async function Page() {
  const [v, a] = await Promise.all([
    safePublicLegacy<any>('content.list', { kind: 'video' }, { items: [] }),
    safePublicLegacy<any>('content.list', { kind: 'article' }, { items: [] }),
  ]);
  const videos: any[] = Array.isArray(v.items) ? v.items : [];
  const articles: any[] = Array.isArray(a.items) ? a.items.slice(0, 4) : [];

  return (
    <>
      <PageHero title="วิดีโอ" subtitle="รีวิวสินค้า วิธีใช้งาน และเนื้อหาจากทีมงาน" />
      <div className="mx-auto max-w-6xl px-4 py-10">
        {videos.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            {videos.map((x: any, i: number) => {
              const id = youtubeId(x.video_url || x.url);
              const watchUrl = id
                ? `https://www.youtube.com/watch?v=${id}`
                : String(x.video_url || x.url || '');
              return (
                <article
                  key={String(x.id || i)}
                  className="tsk-pop overflow-hidden rounded-2xl border bg-white shadow-sm"
                >
                  <div className="aspect-video bg-slate-950">
                    {id ? (
                      <iframe
                        className="h-full w-full"
                        src={`https://www.youtube-nocookie.com/embed/${id}`}
                        title={String(x.title || 'วิดีโอ')}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : watchUrl ? (
                      <a
                        href={watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid h-full place-items-center p-6 text-center text-sm font-bold text-white tsk-link"
                      >
                        เปิดดูวิดีโอ “{String(x.title || 'วิดีโอ')}” ในแท็บใหม่ →
                      </a>
                    ) : null}
                  </div>
                  <div className="p-5">
                    <h2 className="font-bold leading-7">{x.title || 'วิดีโอ'}</h2>
                    {(x.summary || x.excerpt) && (
                      <p className="mt-2 text-sm leading-6 text-slate-500">{x.summary || x.excerpt}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border bg-white p-10 text-center">
            <h2 className="font-bold">ยังไม่มีวิดีโอตอนนี้</h2>
            <p className="mt-1 text-sm text-slate-500">ทีมงานกำลังตัดต่อคลิปใหม่ ติดตามได้เร็ว ๆ นี้</p>
          </div>
        )}

        {articles.length > 0 && (
          <section className="mt-12" aria-labelledby="videos-articles">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">ARTICLES</p>
                <h2 id="videos-articles" className="mt-1 text-2xl font-black">
                  อ่านประกอบก่อนดู
                </h2>
              </div>
              <Link href="/news" className="text-sm font-bold text-emerald-800 tsk-link">
                ข่าวสารทั้งหมด
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {articles.map((x: any, i: number) => (
                <article
                  key={String(x.id || i)}
                  className="tsk-pop rounded-2xl border bg-white p-5 shadow-sm"
                >
                  <h3 className="line-clamp-2 font-bold leading-7">{x.title || x.name || 'บทความ'}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                    {x.excerpt || x.summary || x.body || ''}
                  </p>
                  {x.url ? (
                    <Link
                      href={String(x.url)}
                      className="mt-3 inline-block text-sm font-bold text-emerald-800 tsk-link"
                    >
                      อ่านเพิ่มเติม →
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
