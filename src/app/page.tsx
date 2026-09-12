import Image from 'next/image';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ArticleCard } from '@/components/home/article-card';
import { AutoRail } from '@/components/home/auto-rail';
import { BrandItem } from '@/components/home/brand-item';
import { EntryPopup } from '@/components/home/entry-popup';
import { FeaturedTabs } from '@/components/home/featured-tabs';
import { Hero } from '@/components/home/hero';
import {
  ArticleCardPlaceholder,
  BrandItemPlaceholder,
  CategoryItemPlaceholder,
} from '@/components/home/placeholders';
import { QuoteSection } from '@/components/home/quote-section';
import { SectionTitle } from '@/components/home/section-title';
import { ServiceBenefits } from '@/components/home/service-benefits';
import { getSiteSettings } from '@/server/catalog';
import { DYNAMIC_SECTIONS, getHomepageData } from '@/server/homepage';

/**
 * HOMEPAGE — THAISERKIT SUPPLY (ตาม mockup หน้าแรก 100%)
 * ลำดับ: hero รูปเต็ม / หมวดหมู่รางรูป / สินค้าแนะนำ+flash ข้าง / แบนเนอร์กว้างคู่ /
 * บทความ / แบรนด์ / ขอใบเสนอราคา+ฟอร์ม / จุดเด่นบริการ / footer
 * รูปทั้งหมดมาจาก CMS หลังบ้าน (admin/เนื้อหา/หมวดหมู่/แบรนด์) — ไม่มีรูปแต่งในโค้ด
 */
export default async function HomePage() {
  const [site, home] = await Promise.all([getSiteSettings(), getHomepageData()]);

  const categorySlots = DYNAMIC_SECTIONS.CATEGORY_SECTION.slots;
  const articleSlots = DYNAMIC_SECTIONS.ARTICLE_SECTION.slots;
  const brandSlots = DYNAMIC_SECTIONS.BRAND_SECTION.slots;

  const missingCategories = Math.max(0, categorySlots - home.categories.length);
  const missingArticles = Math.max(0, articleSlots - home.articles.length);

  return (
    <>
      <EntryPopup popup={(site.entry_popup ?? null) as ComponentProps<typeof EntryPopup>['popup']} />

      <Hero banners={home.banners} />

      {/* หมวดหมู่ — รางรูปภาพแนวนอน + ลูกศร */}
      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6" aria-label="เลือกซื้อสินค้าตามหมวดหมู่">
        <SectionTitle eyebrow="SHOP BY CATEGORY" title="เลือกซื้อสินค้าตามหมวดหมู่" href="/products" />
        <p className="-mt-3 mb-5 text-sm text-slate-500">เครื่องมือช่าง อุปกรณ์อุตสาหกรรม ครบจบในที่เดียว</p>
        {home.categories.length > 0 ? (
          <AutoRail
            label="หมวดหมู่สินค้า"
            itemClassName="min-w-[32%] snap-start sm:min-w-[18%] lg:min-w-[11%]"
            arrows
          >
            {home.categories.map((c) => (
              <Link
                key={c.key}
                href={`/products?category=${encodeURIComponent(c.key)}`}
                className="group block rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                {c.image ? (
                  // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
                  <img
                    src={c.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : (
                  <span className="grid aspect-square w-full place-items-center rounded-xl bg-slate-100 text-xl font-black text-slate-400">
                    {c.name.trim().charAt(0) || '•'}
                  </span>
                )}
                <strong className="mt-2 line-clamp-2 block min-h-10 text-sm leading-5">{c.name}</strong>
              </Link>
            ))}
          </AutoRail>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {placeholderIds(categorySlots, 'category-ph').map((id) => (
              <CategoryItemPlaceholder key={id} />
            ))}
          </div>
        )}
        {home.categories.length > 0 && missingCategories > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {placeholderIds(missingCategories, 'category-ph').map((id) => (
              <CategoryItemPlaceholder key={id} />
            ))}
          </div>
        )}
      </section>

      {/* สินค้าแนะนำแบบแท็บ + การ์ด Flash Sale ข้าง ๆ */}
      <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="สินค้าแนะนำ">
        <FeaturedTabs
          popular={home.featured}
          fresh={home.fresh}
          sale={home.flash.items.map((item) => item.product)}
          flashEndsAt={home.flash.endsAt}
        />
      </section>

      {/* แบนเนอร์กว้างคู่ — รูปจาก CMS (admin/เนื้อหา → แบนเนอร์คั่นบทความ) ไม่มีใช้รูป legacy */}
      <WideBanners
        arrivalImage={String(site.new_arrival_image_url || '/legacy-assets/banners/2.png')}
        quoteImage={String(site.quote_image_url || '/legacy-assets/banners/3.png')}
      />

      {/* บทความ */}
      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6" aria-label="บทความและข่าวสาร">
        <SectionTitle
          eyebrow="TIPS & ARTICLES"
          title="บทความและข่าวสาร"
          href="/news"
          linkLabel="ดูบทความทั้งหมด"
        />
        <p className="-mt-3 mb-5 text-sm text-slate-500">อัปเดตความรู้ เทคนิคการใช้งาน และข่าวสารล่าสุด</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {home.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
          {placeholderIds(missingArticles, 'article-ph').map((id) => (
            <ArticleCardPlaceholder key={id} />
          ))}
        </div>
      </section>

      {/* แบรนด์ */}
      <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="แบรนด์ยอดนิยม">
        <SectionTitle eyebrow="TOP BRANDS" title="แบรนด์ยอดนิยม" href="/brands" linkLabel="ดูแบรนด์ทั้งหมด" />
        {home.brands.length > 0 ? (
          <AutoRail
            label="แบรนด์ยอดนิยม"
            itemClassName="grid h-16 w-36 shrink-0 snap-start place-items-center sm:w-44"
          >
            {home.brands.map((brand) => (
              <BrandItem key={brand.id} brand={brand} />
            ))}
          </AutoRail>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {placeholderIds(brandSlots, 'brand-ph').map((id) => (
              <BrandItemPlaceholder key={id} />
            ))}
          </div>
        )}
      </section>

      <QuoteSection />
      <ServiceBenefits />
    </>
  );
}

function WideBanners({ arrivalImage, quoteImage }: { arrivalImage: string; quoteImage: string }) {
  return (
    <section
      className="mx-auto grid max-w-7xl gap-4 px-4 pb-12 lg:grid-cols-2 lg:px-6"
      aria-label="โปรโมชันพิเศษ"
    >
      <Link
        href="/products"
        className="group relative block overflow-hidden rounded-3xl bg-emerald-950 shadow-sm transition hover:shadow-lg"
      >
        <span className="relative block aspect-[16/8]">
          <Image
            src={arrivalImage}
            alt="สินค้าใหม่"
            fill
            loading="lazy"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            unoptimized={arrivalImage.startsWith('data:')}
          />
        </span>
        <span className="absolute inset-0 bg-gradient-to-r from-emerald-950/90 via-emerald-950/40 to-transparent" />
        <span className="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
          <b className="text-sm font-bold text-emerald-200">สินค้าใหม่</b>
          <strong className="mt-1 text-2xl font-black text-white sm:text-3xl">NEW ARRIVAL</strong>
          <small className="mt-2 max-w-xs text-sm leading-6 text-white/80">
            อัปเดตสินค้าเข้าใหม่ทุกไซส์ เครื่องมือ อุปกรณ์เสริมและอะไหล่
          </small>
          <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-emerald-950">
            ดูสินค้าใหม่ →
          </span>
        </span>
      </Link>
      <Link
        href="/quotation"
        className="group relative block overflow-hidden rounded-3xl bg-emerald-950 shadow-sm transition hover:shadow-lg"
      >
        <span className="relative block aspect-[16/8]">
          <Image
            src={quoteImage}
            alt="ดีลสำหรับองค์กร"
            fill
            loading="lazy"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            unoptimized={quoteImage.startsWith('data:')}
          />
        </span>
        <span className="absolute inset-0 bg-gradient-to-r from-emerald-950/90 via-emerald-950/40 to-transparent" />
        <span className="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
          <b className="text-sm font-bold text-emerald-200">ดีลสำหรับองค์กร</b>
          <strong className="mt-1 text-2xl font-black text-white sm:text-3xl">ขอใบเสนอราคา</strong>
          <small className="mt-2 max-w-xs text-sm leading-6 text-white/80">
            ราคาพิเศษสำหรับหน่วยงาน และลูกค้าองค์กร
          </small>
          <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-white">
            ติดต่อฝ่ายขาย →
          </span>
        </span>
      </Link>
    </section>
  );
}

/** รหัสคงที่สำหรับ placeholder — render ครั้งเดียวฝั่ง server ไม่มี reorder จึงปลอดภัย */
function placeholderIds(count: number, prefix: string): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `${prefix}-${index + 1}`);
}
