import { Handshake } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { ProductCard } from '@/components/commerce/product-card';
import { ArticleCard } from '@/components/home/article-card';
import { AutoRail } from '@/components/home/auto-rail';
import { BrandItem } from '@/components/home/brand-item';
import { CategoryGrid } from '@/components/home/category-grid';
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
import { PromoTrio } from '@/components/home/promo-trio';
import { SaleCountdown } from '@/components/home/sale-countdown';
import { SectionTitle } from '@/components/home/section-title';
import { ServiceBenefits } from '@/components/home/service-benefits';
import { getSiteSettings } from '@/server/catalog';
import { DYNAMIC_SECTIONS, getHomepageData } from '@/server/homepage';

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
  const [site, home] = await Promise.all([getSiteSettings(), getHomepageData()]);

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
      <EntryPopup popup={(site.entry_popup ?? null) as ComponentProps<typeof EntryPopup>['popup']} />

      {/* 2. HERO — STATIC_UI / CMS_READY (Supabase: banners) */}
      <Hero banners={home.banners} />

      {/* 3. PROMOTION_BANNERS — การ์ดโปร 3 ใบตาม mockup */}
      <PromoTrio />

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
        <SectionTitle eyebrow="BEST SELLER" title="สินค้าขายดี แนะนำสำหรับคุณ" href="/products" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {home.featured.map((p) => (
            <ProductCard key={p.id} product={p} badge="ขายดี" cta />
          ))}
          {placeholderIds(missingFeatured, 'featured-ph').map((id) => (
            <ProductCardPlaceholder key={id} />
          ))}
        </div>
      </section>

      {/* 6. FLASH_SALE — แถบเต็มจอตาม mockup + เลื่อนออโต้ */}
      <section
        className="bg-gradient-to-r from-orange-500 via-rose-600 to-red-600 py-10 text-white"
        aria-label="Flash Sale"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 lg:grid-cols-[30%_1fr] lg:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-white/85">⚡ FLASH SALE</p>
            <h2 className="mt-1 text-2xl font-black sm:text-3xl">สินค้าราคาพิเศษ</h2>
            <div className="mt-4">
              <SaleCountdown endsAt={home.flash.endsAt} />
            </div>
            <Link
              href="/products?status=สินค้าลดราคา"
              className="mt-5 inline-flex items-center gap-1 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-rose-950 transition hover:bg-amber-300"
            >
              ดูสินค้า Flash Sale ทั้งหมด →
            </Link>
          </div>
          <AutoRail
            label="สินค้า Flash Sale"
            itemClassName="min-w-[47%] snap-start sm:min-w-[31%] lg:min-w-[23%]"
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

      {/* 7. ARTICLE_SECTION — DYNAMIC_DATA (Supabase: articles) */}
      <section className="mx-auto max-w-7xl px-4 py-10 lg:px-6" aria-label="บทความและเคล็ดลับ">
        <SectionTitle eyebrow="TIPS & ARTICLES" title="บทความ & เคล็ดลับ" href="/news" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {home.articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
          {placeholderIds(missingArticles, 'article-ph').map((id) => (
            <ArticleCardPlaceholder key={id} />
          ))}
        </div>
      </section>

      {/* 8. BRAND_SECTION — DYNAMIC_DATA (Supabase: brands): โลโก้ล้วนไร้กรอบ เลื่อนออโต้สมูท + ลากได้ */}
      <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="แบรนด์">
        <SectionTitle eyebrow="TOP BRANDS" title="แบรนด์ชั้นนำ ที่เราคัดสรรมาเพื่อคุณ" href="/brands" />
        {home.brands.length > 0 ? (
          <AutoRail
            label="แบรนด์ชั้นนำ"
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

      {/* 9. DEALER_REGISTER — แถบเต็มจอ + ปุ่ม CTA (ฟอร์มอยู่ที่ /partner-register) */}
      <section className="bg-emerald-950 py-12 text-white" aria-label="สมัครตัวแทนจำหน่าย">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 lg:grid-cols-[1fr_auto] lg:px-6">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-emerald-200">
              <Handshake size={18} /> ร่วมเป็นตัวแทนจำหน่ายกับ THAISERKIT SUPPLY
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              เติบโตไปด้วยกัน <span className="text-amber-300">โอกาสทางธุรกิจที่มากกว่า</span>
            </h2>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-emerald-50">
              {['ราคาพิเศษสำหรับตัวแทน', 'มีทีมงานให้คำปรึกษา', 'พร้อมเปิดใบกำกับภาษี', 'สร้างรายได้เสริม'].map((b) => (
                <li key={b} className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="grid size-6 place-items-center rounded-full bg-emerald-800 text-xs"
                  >
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/partner-register"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-amber-400 px-8 py-4 text-base font-black text-emerald-950 shadow-lg transition hover:bg-amber-300"
          >
            สมัครเป็นตัวแทน →
          </Link>
        </div>
      </section>

      {/* 10. SERVICE_BENEFITS — STATIC_UI */}
      <ServiceBenefits />
    </>
  );
}

/** รหัสคงที่สำหรับ placeholder — render ครั้งเดียวฝั่ง server ไม่มี reorder จึงปลอดภัย */
function placeholderIds(count: number, prefix: string): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `${prefix}-${index + 1}`);
}
