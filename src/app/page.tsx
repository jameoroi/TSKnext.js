import type { ComponentProps } from 'react';
import { ProductCard } from '@/components/commerce/product-card';
import { BannerCarousel } from '@/components/content/banner-carousel';
import { ArticleCard } from '@/components/home/article-card';
import { AutoRail } from '@/components/home/auto-rail';
import { BrandItem } from '@/components/home/brand-item';
import { CategoryGrid } from '@/components/home/category-grid';
import { DealerRegisterSection } from '@/components/home/dealer-register-section';
import { EntryPopup } from '@/components/home/entry-popup';
import { FlashSaleCard } from '@/components/home/flash-sale-card';
import { Hero } from '@/components/home/hero';
import {
  ArticleCardPlaceholder,
  BrandItemPlaceholder,
  CategoryItemPlaceholder,
  FlashSaleCardPlaceholder,
  ProductCardPlaceholder,
} from '@/components/home/placeholders';
import { PromoBanners } from '@/components/home/promo-banners';
import { PromoRail } from '@/components/home/promo-rail';
import { SaleCountdown } from '@/components/home/sale-countdown';
import { SectionTitle } from '@/components/home/section-title';
import { DYNAMIC_SECTIONS, emptyHomepageData, getHomepageData, homepageDegraded } from '@/server/homepage';

/**
 * HOMEPAGE — THAISERKIT SUPPLY (E-commerce Homepage)
 * ============================================================================
 * ลำดับ section ตามสเปก PROJECT 100%:
 *   1. HEADER            STATIC_UI            (layout chrome)
 *   2. HERO              STATIC_UI/CMS_READY  (Supabase: banners)
 *   3. PROMOTION_BANNERS DYNAMIC_DATA        (Supabase: banners — 3 ช่อง)
 *   4. CATEGORY_SECTION  DYNAMIC_DATA        (Supabase: categories — 8 การ์ด)
 *   5. FEATURED_PRODUCTS DYNAMIC_DATA        (Supabase: products — 5 การ์ด)
 *   6. FLASH_SALE        DYNAMIC_DATA        (Supabase: products/promotions — 4 การ์ด + countdown + stock progress)
 *   7. ARTICLE_SECTION   DYNAMIC_DATA        (Supabase: articles — 4 การ์ด)
 *   8. BRAND_SECTION     DYNAMIC_DATA        (Supabase: brands — 8 ชิ้น)
 *   9. DEALER_REGISTER   STATIC_UI + FORM    (Supabase: dealer_applications)
 *  10. SERVICE_BENEFITS  STATIC_UI           (layout ต่อท้าย)
 *  11. FOOTER            STATIC_UI           (layout chrome)
 *
 * IMPORTANT_DATA_RULE: ส่วน DYNAMIC_DATA ทั้งหมดไม่มีการ hardcode
 * สินค้า/ชื่อ/ราคา/รุ่น/สต็อก/รูป demo ในโค้ด — ถ้ายังไม่มีข้อมูลจริง
 * จะแสดง placeholder skeleton แทนเสมอ
 * ============================================================================
 */
export default async function HomePage() {
  const homeResult = await Promise.allSettled([getHomepageData()]);
  const home = homeResult[0].status === 'fulfilled' ? homeResult[0].value : emptyHomepageData();

  const categorySlots = DYNAMIC_SECTIONS.CATEGORY_SECTION.slots;
  const featuredSlots = DYNAMIC_SECTIONS.FEATURED_PRODUCTS.slots;
  const flashSlots = DYNAMIC_SECTIONS.FLASH_SALE.slots;
  const articleSlots = DYNAMIC_SECTIONS.ARTICLE_SECTION.slots;
  const brandSlots = DYNAMIC_SECTIONS.BRAND_SECTION.slots;

  const missingCategories = Math.max(0, categorySlots - home.categories.length);
  const missingFeatured = Math.max(0, featuredSlots - home.featured.length);
  const missingFlash = Math.max(0, flashSlots - home.flash.items.length);
  const missingArticles = Math.max(0, articleSlots - home.articles.length);

  return (
    <>
      {/* Read by cloudflare/worker-entry.js: a render with every shelf empty is never cached. */}
      {homepageDegraded(home) && <meta name="tsk-degraded" content="1" />}
      <h1 className="sr-only">THAISERKIT SUPPLY ไทยเซอร์กิจ ซัพพลาย — เครื่องมือช่าง อุปกรณ์การเกษตร และอุตสาหกรรม</h1>
      <EntryPopup popup={home.entryPopup as ComponentProps<typeof EntryPopup>['popup']} />

      {/* 2. HERO — STATIC_UI / CMS_READY (Supabase: banners) */}
      <Hero banners={home.banners} />

      {/* 3. PROMOTION_BANNERS — DYNAMIC_DATA 3 ช่อง (Supabase: banners) */}
      <PromoBanners banners={home.promoBanners} />

      {/* 4. CATEGORY_SECTION — DYNAMIC_DATA (Supabase: categories) */}
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-6" aria-label="เลือกช้อปตามหมวดหมู่">
        <SectionTitle eyebrow="SHOP BY CATEGORY" title="เลือกช้อปตามหมวดหมู่" href="/products" />
        <p className="-mt-3 mb-5 text-sm text-slate-500">ค้นหาสินค้าให้ใช่ ตอบโจทย์ทุกงานช่างและอุตสาหกรรม</p>
        {home.categories.length > 0 && (
          <CategoryGrid
            categories={home.categories.map((c) => ({
              key: c.key,
              name: c.name,
              en: c.en,
              icon: c.icon,
              image: c.image,
            }))}
          />
        )}
        {missingCategories > 0 && (
          <div
            className={`grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8 ${home.categories.length > 0 ? 'mt-3' : ''}`}
          >
            {placeholderIds(
              home.categories.length > 0 ? missingCategories : categorySlots,
              'category-ph',
            ).map((id) => (
              <CategoryItemPlaceholder key={id} />
            ))}
          </div>
        )}
      </section>

      {/* 5. FEATURED_PRODUCTS — DYNAMIC_DATA (Supabase: products) */}
      <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="สินค้าขายดี สินค้าแนะนำ">
        <SectionTitle eyebrow="BEST SELLER" title="สินค้าขายดี / สินค้าแนะนำ" href="/products" />
        <AutoRail
          label="สินค้าขายดี"
          mobileOnly
          itemClassName="w-[46%] shrink-0 sm:w-auto"
          desktopClassName="sm:grid sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
        >
          {home.featured.map((p) => (
            <ProductCard key={p.id} product={p} badge="ขายดี" cta />
          ))}
          {placeholderIds(missingFeatured, 'featured-ph').map((id) => (
            <ProductCardPlaceholder key={id} />
          ))}
        </AutoRail>
      </section>

      {/* 6. FLASH_SALE — DYNAMIC_DATA (Supabase: products / promotions) */}
      {/* แบนด์สีอยู่ใน main (rounded) — มีแค่ header ที่เต็มจอ */}
      <section className="mx-auto max-w-7xl px-4 lg:px-6" aria-label="Flash Sale">
        <div
          className={`relative isolate grid items-center gap-5 rounded-3xl bg-gradient-to-r from-orange-500 via-rose-600 to-red-600 px-3 py-6 text-white sm:gap-6 sm:px-6 sm:py-10 lg:grid-cols-[30%_1fr] lg:px-8 ${home.flashBackground ? 'overflow-hidden xl:aspect-[2800/1080] xl:py-0' : ''}`}
        >
          {home.flashBackground && (
            <>
              {/* Full-box picture from the admin (เนื้อหา → พื้นหลัง Flash Sale); the colour band stays as fallback. */}
              {/* Every active picture slides behind the box. */}
              <BannerCarousel
                background
                slides={(home.flashBackgrounds.length ? home.flashBackgrounds : [home.flashBackground]).map(
                  (src) => ({ src }),
                )}
              />
            </>
          )}
          <div>
            {home.flashBackground ? (
              // The uploaded artwork already says FLASH SALE; the text stays for screen readers only.
              <h2 className="sr-only">FLASH SALE สินค้าราคาพิเศษ จำนวนจำกัด</h2>
            ) : (
              <>
                <p className="text-xs font-black uppercase tracking-[.2em] text-white/85">⚡ FLASH SALE</p>
                <h2 className="mt-1 text-2xl font-black sm:text-3xl">FLASH SALE</h2>
                <p className="mt-2 text-sm font-bold text-white/85">สินค้าราคาพิเศษ จำนวนจำกัด</p>
              </>
            )}
            <div className={home.flashBackground ? '' : 'mt-4'}>
              <SaleCountdown endsAt={home.flash.endsAt} />
            </div>
          </div>
          <AutoRail
            label="Flash Sale"
            mobileOnly
            itemClassName="w-[46%] shrink-0 sm:w-auto"
            desktopClassName="sm:grid sm:grid-cols-3 sm:gap-3 xl:grid-cols-4"
          >
            {home.flash.items.map((item) => (
              <FlashSaleCard key={item.product.id} item={item} />
            ))}
            {placeholderIds(missingFlash, 'flash-ph').map((id) => (
              <FlashSaleCardPlaceholder key={id} />
            ))}
          </AutoRail>
        </div>
      </section>

      {/* 6b. CAMPAIGN BAND — the wide 6:1 banner above the articles (admin: แบนเนอร์บทความ) */}
      <PromoRail banners={home.articleBanners} variant="campaign" />

      {/* 7. ARTICLE_SECTION — DYNAMIC_DATA (Supabase: articles) */}
      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6" aria-label="บทความและเคล็ดลับ">
        <SectionTitle eyebrow="TIPS & ARTICLES" title="บทความ & เคล็ดลับ" href="/news" />
        <AutoRail
          label="บทความ"
          mobileOnly
          itemClassName="w-[78%] shrink-0 sm:w-auto"
          desktopClassName="sm:grid sm:grid-cols-2 xl:grid-cols-4"
        >
          {home.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
          {placeholderIds(missingArticles, 'article-ph').map((id) => (
            <ArticleCardPlaceholder key={id} />
          ))}
        </AutoRail>
      </section>

      {/* 8. BRAND_SECTION — DYNAMIC_DATA (Supabase: brands): โลโก้ล้วนไร้กรอบ เลื่อนออโต้สมูท + ลากได้ */}
      <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="แบรนด์">
        <SectionTitle eyebrow="TOP BRANDS" title="แบรนด์" href="/brands" />
        {home.brands.length > 0 ? (
          <AutoRail
            label="แบรนด์"
            mobileOnly
            itemClassName="w-[34%] shrink-0 sm:w-auto"
            desktopClassName="sm:grid sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
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

      {/* 9. DEALER_REGISTER — STATIC_UI + FORM (Supabase: dealer_applications) */}
      <DealerRegisterSection
        backgroundImage={home.dealerBackground}
        backgroundImages={home.dealerBackgrounds}
      />

      {/* 10. SERVICE_BENEFITS — shown once for every page by TrustStrip in the site chrome */}
    </>
  );
}

/** รหัสคงที่สำหรับ placeholder — render ครั้งเดียวฝั่ง server ไม่มี reorder จึงปลอดภัย */
function placeholderIds(count: number, prefix: string): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `${prefix}-${index + 1}`);
}
