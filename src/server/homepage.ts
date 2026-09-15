import 'server-only';

import type { Product } from '@/features/catalog/types';
import { getBrands, getCategories, getProducts, getSiteSettings } from '@/server/catalog';
import { safePublicLegacy } from '@/server/public-legacy-cache';

/**
 * HOME DATA LAYER — THAISERKIT SUPPLY
 * ============================================================================
 * แยกพื้นที่หน้าแรกออกเป็น 2 กลุ่มชัดเจน ตามสเปก PROJECT:
 *
 *   STATIC_UI    — เขียนตายตัวในโค้ดได้ (header / hero copy / dealer form
 *                  shell / service benefits / footer) ไม่ต้องรอข้อมูลหลังบ้าน
 *   DYNAMIC_DATA — ห้าม hardcode สินค้า/ราคา/ชื่อ/สต็อกจริงในโค้ด
 *                  ทุก section รับข้อมูลจาก loader ด้านล่างเท่านั้น
 *                  ถ้ายังไม่มีข้อมูลจริง ให้คืน array ว่าง แล้ว UI จะแสดง
 *                  placeholder (skeleton) แทน — ไม่มีการแต่งชื่อ/ราคา/รูปขึ้นมา
 *
 * FUTURE DATA SOURCE (Supabase — ยังไม่ต่อ, โครงพร้อมแล้ว):
 *   banners      -> Supabase: banners            (hero slider + promo trio)
 *   categories   -> Supabase: categories         { category_image, category_name, category_slug }
 *   featured     -> Supabase: products           (สินค้าขายดี / แนะนำ)
 *   flash        -> Supabase: products/promotions { sale window + stock }
 *   articles     -> Supabase: articles           { image, title, excerpt, category, published_at, slug }
 *   brands       -> Supabase: brands             { brand_logo, brand_name, brand_slug }
 *   dealer form  -> Supabase: dealer_applications { full_name, shop_name, phone, email, province, message }
 *
 * CURRENT ADAPTERS — ใช้ framework เดิมของโค้ด (server/catalog + legacy cache)
 * ไม่เพิ่ม dependency ใหม่ และไม่แต่งข้อมูลตัวอย่าง (no DEMO_PRODUCTS fallback)
 * ============================================================================
 */

export const STATIC_UI_SECTIONS = [
  'HEADER',
  'HERO_COPY',
  'DEALER_REGISTER_SHELL',
  'SERVICE_BENEFITS',
  'FOOTER',
] as const;

export const DYNAMIC_SECTIONS = {
  PROMOTION_BANNERS: { source_future: 'Supabase: banners', slots: 3 },
  CATEGORY_SECTION: { source_future: 'Supabase: categories', slots: 8 },
  FEATURED_PRODUCTS: { source_future: 'Supabase: products', slots: 5 },
  FLASH_SALE: { source_future: 'Supabase: products / promotions', slots: 4 },
  ARTICLE_SECTION: { source_future: 'Supabase: articles', slots: 4 },
  BRAND_SECTION: { source_future: 'Supabase: brands', slots: 8 },
} as const;

export type HomeCategory = {
  key: string;
  name: string;
  en: string;
  icon: string | null;
  image: string;
  slug: string;
};

export type HomeArticle = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  image: string;
  slug: string;
};

export type HomeBrand = {
  id: string;
  name: string;
  logo: string;
  slug: string;
};

export type FlashSaleItem = {
  product: Product;
  normalPrice: number;
  salePrice: number;
  discountPercent: number;
  stockQuantity: number | null;
  /** null = หลังบ้านไม่ได้ส่งมา → UI ซ่อน ไม่แต่งตัวเลขขึ้นมา */
  soldQuantity: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type HomepageData = {
  entryPopup: Record<string, unknown> | null;
  banners: Array<Record<string, unknown>>;
  promoBanners: Array<Record<string, unknown>>;
  /** The wide campaign band above the articles (admin: แบนเนอร์บทความ, 6:1). */
  articleBanners: Array<Record<string, unknown>>;
  /** Full-box background pictures set in the admin; empty keeps the colour band. */
  flashBackground: string;
  dealerBackground: string;
  /** All active pictures for each box, in the admin order; they slide on the home page. */
  flashBackgrounds: string[];
  dealerBackgrounds: string[];
  categories: HomeCategory[];
  featured: Product[];
  flash: { items: FlashSaleItem[]; endsAt: string };
  articles: HomeArticle[];
  brands: HomeBrand[];
};

export function emptyHomepageData(): HomepageData {
  return {
    entryPopup: null,
    banners: [],
    promoBanners: [],
    articleBanners: [],
    flashBackground: '',
    dealerBackground: '',
    flashBackgrounds: [],
    dealerBackgrounds: [],
    categories: [],
    featured: [],
    flash: { items: [], endsAt: '' },
    articles: [],
    brands: [],
  };
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function finiteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function articleDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function mapCategory(row: Record<string, unknown>): HomeCategory | null {
  const key = text(row.key || row.id || row.slug || row.name);
  const name = text(row.name || key);
  if (!key || !name) return null;
  return {
    key,
    name,
    en: text(row.en),
    icon: typeof row.icon === 'string' ? row.icon : null,
    image: text(row.image_url || row.img || row.image),
    slug: text(row.slug || key),
  };
}

function mapBrand(row: Record<string, unknown>): HomeBrand | null {
  const name = text(row.name);
  if (!name) return null;
  return {
    id: text(row.id || row.slug || name),
    name,
    logo: text(row.logo_url || row.logo_data_url || row.logo || row.img || row.image),
    slug: text(row.slug || row.id || name),
  };
}

function mapArticle(row: Record<string, unknown>, index: number): HomeArticle | null {
  const title = text(row.title || row.name);
  if (!title) return null;
  return {
    id: text(row.id || `article-${index}`),
    title,
    excerpt: text(row.excerpt || row.description || row.summary),
    category: text(row.category || row.tag),
    publishedAt: articleDate(row.published_at || row.publishedAt || row.created_at || row.date),
    image: text(row.image_url || row.img || row.image || row.cover),
    slug: text(row.slug || row.id || ''),
  };
}

function mapFlashSale(product: Product): FlashSaleItem | null {
  const salePrice = Number(product.price || 0);
  const normalPrice = Number(product.oldPrice ?? product.old_price ?? 0);
  if (!(salePrice > 0 && normalPrice > salePrice)) return null;
  const raw = product as Record<string, unknown>;
  const stock = finiteNumber(product.stock ?? raw.stock_quantity ?? raw.available);
  const sold = finiteNumber(raw.sold_quantity ?? raw.sold ?? raw.sold_qty);
  const startsAt = text(raw.sale_start_at || raw.starts_at || raw.flash_start_at) || null;
  const endsAt = text(raw.sale_end_at || raw.ends_at || raw.flash_end_at) || null;
  return {
    product,
    normalPrice,
    salePrice,
    discountPercent: Math.round((1 - salePrice / normalPrice) * 100),
    stockQuantity: stock != null ? Math.max(0, Math.trunc(stock)) : null,
    soldQuantity: sold != null ? Math.max(0, Math.trunc(sold)) : null,
    startsAt,
    endsAt,
  };
}

export async function getHomepageData(): Promise<HomepageData> {
  const [siteResult, categoryResult, brandResult, featuredResult, saleResult, articleResult] =
    await Promise.allSettled([
      getSiteSettings(),
      getCategories(),
      getBrands(),
      getProducts({ featured: 1, per_page: DYNAMIC_SECTIONS.FEATURED_PRODUCTS.slots }),
      // Enough on-sale products to pick the deepest discounts for the shelf, not sixty.
      getProducts({ status: 'สินค้าลดราคา', per_page: 24 }),
      safePublicLegacy<{ items?: unknown }>('content.list', { kind: 'article' }, { items: [] }),
    ]);
  const site = siteResult.status === 'fulfilled' ? siteResult.value : {};
  const categoryRows = categoryResult.status === 'fulfilled' ? categoryResult.value : [];
  const brandRows = brandResult.status === 'fulfilled' ? brandResult.value : [];
  const featuredRes = featuredResult.status === 'fulfilled' ? featuredResult.value : { products: [] };
  const saleRes = saleResult.status === 'fulfilled' ? saleResult.value : { products: [] };
  const articlePayload = articleResult.status === 'fulfilled' ? articleResult.value : { items: [] };

  const banners = Array.isArray(site.banners)
    ? site.banners.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    : [];
  const promoBanners = Array.isArray(site.promo_banners)
    ? site.promo_banners.filter((row): row is Record<string, unknown> =>
        Boolean(row && typeof row === 'object'),
      )
    : [];

  const bannerRows = (value: unknown) =>
    (Array.isArray(value) ? value : []).filter(
      (row): row is Record<string, unknown> =>
        Boolean(row && typeof row === 'object') && (row as Record<string, unknown>).active !== false,
    );
  const articleBanners = bannerRows(site.article_banners).filter((row) => text(row.img || row.image_url));
  // One picture per box: the first active one the admin uploaded.
  const firstImage = (value: unknown) => {
    const row = bannerRows(value).find((item) => text(item.img || item.image_url));
    return row ? text(row.img || row.image_url) : '';
  };
  const allImages = (value: unknown) =>
    bannerRows(value)
      .map((item) => text(item.img || item.image_url))
      .filter(Boolean);

  const categories = (Array.isArray(categoryRows) ? categoryRows : [])
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(mapCategory)
    .filter((c): c is HomeCategory => c !== null)
    .slice(0, DYNAMIC_SECTIONS.CATEGORY_SECTION.slots);

  const active = (list: Product[]) => list.filter((p) => p?.state !== 'inactive');
  const featured = active(featuredRes.products).slice(0, DYNAMIC_SECTIONS.FEATURED_PRODUCTS.slots);

  const flashItems = active(saleRes.products)
    .map(mapFlashSale)
    .filter((item): item is FlashSaleItem => item !== null)
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .slice(0, DYNAMIC_SECTIONS.FLASH_SALE.slots);
  const fallbackFlashItems = flashItems.length
    ? flashItems
    : active(featuredRes.products)
        .map(mapFlashSale)
        .filter((item): item is FlashSaleItem => item !== null)
        .sort((a, b) => b.discountPercent - a.discountPercent)
        .slice(0, DYNAMIC_SECTIONS.FLASH_SALE.slots);

  const rawArticles = Array.isArray(articlePayload?.items) ? (articlePayload.items as unknown[]) : [];
  const articles = rawArticles
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(mapArticle)
    .filter((a): a is HomeArticle => a !== null)
    .slice(0, DYNAMIC_SECTIONS.ARTICLE_SECTION.slots);

  const brands = (Array.isArray(brandRows) ? brandRows : [])
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(mapBrand)
    .filter((b): b is HomeBrand => b !== null)
    .slice(0, DYNAMIC_SECTIONS.BRAND_SECTION.slots);

  return {
    entryPopup:
      site.entry_popup && typeof site.entry_popup === 'object'
        ? (site.entry_popup as Record<string, unknown>)
        : null,
    banners,
    promoBanners: promoBanners.slice(0, DYNAMIC_SECTIONS.PROMOTION_BANNERS.slots),
    articleBanners,
    flashBackground: firstImage(site.flash_sale_backgrounds),
    dealerBackground: firstImage(site.dealer_backgrounds),
    flashBackgrounds: allImages(site.flash_sale_backgrounds),
    dealerBackgrounds: allImages(site.dealer_backgrounds),
    categories,
    featured,
    flash: { items: fallbackFlashItems, endsAt: text(site.flash_sale_ends_at) },
    articles,
    brands,
  };
}
