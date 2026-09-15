import Link from 'next/link';
import type { HomeArticle } from '@/server/homepage';

/**
 * ARTICLE_CARD — reusable component (DYNAMIC_DATA)
 * data_source_future: Supabase: articles
 * card: article_image / article_title / article_excerpt / article_category / published_at / article_slug
 */
export function ArticleCard({ article }: { article: HomeArticle }) {
  return (
    <Link href="/news" className="group overflow-hidden rounded-2xl border bg-white shadow-sm tsk-pop">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <span className="absolute left-3 top-3 z-10 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
          {article.category || 'บทความ'}
        </span>
        {article.image ? (
          // รูปจาก CMS อาจเป็น CDN/data URL ใด ๆ — ใช้ img ธรรมดาตามสัญญาเดิมของหลังบ้าน
          // (แบบเดียวกับ PromoRail ของ framework เดิม ไม่ขยาย next/image remotePatterns)
          // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
          <img
            src={article.image}
            alt={article.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-xs font-bold text-slate-400">
            ARTICLE_IMAGE — รอรูปจาก Supabase
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 font-bold leading-6">{article.title}</h3>
        {article.excerpt ? (
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{article.excerpt}</p>
        ) : null}
        {article.publishedAt ? (
          <time className="mt-2 block text-xs text-slate-500">{article.publishedAt}</time>
        ) : null}
      </div>
    </Link>
  );
}
