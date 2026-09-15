import 'server-only';

import { and, desc, eq, notInArray, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cache } from 'react';
import type { Product } from '@/features/catalog/types';
import { resolveTenant } from '@/legacy-api/lib/tenants.js';
import { databaseConfigured, withDb } from '@/server/db/client';
import {
  brands as brandTable,
  categories as categoryTable,
  products as productTable,
} from '@/server/db/schema';
import { FALLBACK_CATEGORIES } from '@/shared/categories';
import { HIDDEN_STATES } from '@/shared/product-visibility.mjs';
import { safePublicLegacy } from './public-legacy-cache';

export type SiteSettings = {
  site_title?: string;
  company_name?: string;
  banners?: Array<Record<string, unknown>>;
  promo_banners?: Array<Record<string, unknown>>;
  article_banners?: Array<Record<string, unknown>>;
  home_headings?: Record<string, string>;
  flash_sale_count?: number;
  flash_sale_ends_at?: string;
  home_cards?: Record<string, string>;
  [key: string]: unknown;
};

async function tenantId() {
  const incoming = await headers();
  // Validated Host first (see requestHostname in server/request-tenant.ts):
  // x-forwarded-host is client-spoofable on direct origin hits.
  const host = String(incoming.get('host') || incoming.get('x-forwarded-host') || 'localhost')
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '');
  const tenant = resolveTenant(host) as { id?: string } | null;
  return String(tenant?.id || '').trim();
}

// LIKE wildcards in the caller's pocket: % and _ inside the query are pattern
// operators. Escape them (every use site carries an explicit ESCAPE clause)
// so catalogue search matches literally.
function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function mapProduct(row: typeof productTable.$inferSelect): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    description: row.description,
    brand: row.brand,
    category: row.categoryKey,
    price: Number(row.priceSatang || 0) / 100,
    oldPrice: row.oldPriceSatang == null ? null : Number(row.oldPriceSatang) / 100,
    old_price: row.oldPriceSatang == null ? null : Number(row.oldPriceSatang) / 100,
    stock: row.stock,
    available: Math.max(0, row.stock - row.reserved),
    img: row.imageUrl,
    imageUrl: row.imageUrl,
    images: Array.isArray(row.images) ? row.images : [],
    detail_images: Array.isArray(row.detailImages) ? row.detailImages : [],
    specs: row.specs || {},
    state: row.status,
    status: row.status,
    barcode: row.barcode,
    source_id: row.sourceId,
    source_url: row.sourceUrl,
    marketplace_source: row.marketplaceSource,
  };
}

async function relationalProducts(params: Record<string, unknown>) {
  if (!databaseConfigured()) return null;
  const tid = await tenantId();
  if (!tid) return null;
  const page = Math.max(1, Math.trunc(Number(params.page) || 1));
  const perPage = Math.max(1, Math.min(250, Math.trunc(Number(params.per_page) || 24)));
  const conditions: any[] = [eq(productTable.tenantId, tid)];
  const q = String(params.q || '').trim();
  const category = String(params.category || '').trim();
  const brand = String(params.brand || '').trim();
  const status = String(params.status || '').trim();
  if (q)
    conditions.push(
      or(
        sql`${productTable.name} ILIKE ${likePattern(q)} ESCAPE '\\'`,
        sql`${productTable.sku} ILIKE ${likePattern(q)} ESCAPE '\\'`,
        sql`${productTable.brand} ILIKE ${likePattern(q)} ESCAPE '\\'`,
      )!,
    );
  if (category) conditions.push(eq(productTable.categoryKey, category));
  if (brand) conditions.push(eq(productTable.brand, brand));
  if (status) {
    if (/ลดราคา|sale|discount/i.test(status))
      conditions.push(
        sql`${productTable.oldPriceSatang} IS NOT NULL AND ${productTable.oldPriceSatang} > ${productTable.priceSatang}`,
      );
    else conditions.push(eq(productTable.status, status));
  } else if (params.include_inactive !== 1 && params.include_inactive !== '1') {
    conditions.push(sql`${productTable.status} NOT IN ('inactive', 'hidden', 'discontinued')`);
  }
  const where = and(...conditions);
  try {
    return await withDb(async (db) => {
      const [rows, countRows] = await Promise.all([
        db
          .select()
          .from(productTable)
          .where(where)
          .orderBy(desc(productTable.updatedAt))
          .limit(perPage)
          .offset((page - 1) * perPage),
        db.select({ count: sql<number>`count(*)::int` }).from(productTable).where(where),
      ]);
      return { products: rows.map(mapProduct), total: Number(countRows[0]?.count || 0), page, perPage };
    });
  } catch (error) {
    console.warn('[catalog] relational products unavailable', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function getSiteSettings() {
  const payload = await safePublicLegacy<Record<string, unknown>>(
    'site.settings',
    { compact: 1 },
    { settings: {} },
  );
  return (payload.settings && typeof payload.settings === 'object' ? payload.settings : {}) as SiteSettings;
}

type ProductListResult = {
  products: Product[];
  total: number;
  page: number;
  perPage: number;
  facets?: Record<string, Record<string, number>> | null;
  ok?: boolean;
};

export async function getProducts(params: Record<string, unknown> = {}): Promise<ProductListResult> {
  // Featured shelves are editorial metadata kept by the commerce API. For all
  // ordinary catalogue reads the relational database is the preferred source —
  // except when the shopper asked for sort/price filtering, which the
  // relational path does not implement. Sending those to the relational path
  // would silently drop them, so they go straight to the commerce API.
  const advanced = params.sort != null && params.sort !== '' && params.sort !== 'default';
  const priced =
    (params.min_price != null && params.min_price !== '') ||
    (params.max_price != null && params.max_price !== '');
  if (!params.featured && !advanced && !priced) {
    const relational = await relationalProducts(params);
    if (relational && (relational.products.length || relational.total > 0)) return relational;
  }
  const payload = await safePublicLegacy<{
    products?: Product[];
    total?: number;
    page?: number;
    per_page?: number;
    facets?: Record<string, Record<string, number>>;
    ok?: boolean;
  }>('products.list', params, { products: [], total: 0, page: 1, per_page: 24 });
  const normalized: ProductListResult = {
    products: Array.isArray(payload.products) ? payload.products : [],
    total: Number(payload.total || 0),
    page: Number(payload.page || 1),
    perPage: Number(payload.per_page || 24),
    facets: payload.facets || null,
    ok: payload.ok !== false,
  };
  if (normalized.products.length || params.featured) return normalized;
  const relational = await relationalProducts(params);
  return relational || normalized;
}

async function loadProduct(idOrSlug: string) {
  if (databaseConfigured()) {
    const tid = await tenantId();
    if (tid) {
      try {
        const rows = await withDb((db) =>
          db
            .select()
            .from(productTable)
            .where(
              and(
                eq(productTable.tenantId, tid),
                notInArray(productTable.status, [...HIDDEN_STATES]),
                or(eq(productTable.id, idOrSlug), eq(productTable.slug, idOrSlug))!,
              ),
            )
            .limit(1),
        );
        if (rows[0]) return { product: mapProduct(rows[0]) };
      } catch (error) {
        console.warn(
          '[catalog] relational product unavailable',
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  return safePublicLegacy<{ product?: Product | null; error?: string; moved_to?: string }>(
    'products.get',
    { id: idOrSlug, slug: idOrSlug },
    { product: null },
    { notFound: 'return' },
  );
}

/**
 * One product lookup per request, shared by generateMetadata and the page.
 *
 * Next renders metadata and the page body concurrently, so each made its own
 * compatibility-API call; when the second one failed the page rendered "not
 * found" under the real product's title. React's request cache dedupes them, and
 * a transient failure is retried once before the page gives up.
 */
export const getProduct = cache(async (idOrSlug: string) => {
  const first = await loadProduct(idOrSlug);
  if (first.product || first.error !== 'unavailable') return first;
  return loadProduct(idOrSlug);
});

export async function getBrands() {
  if (databaseConfigured()) {
    const tid = await tenantId();
    if (tid) {
      try {
        const rows = await withDb((db) =>
          db
            .select()
            .from(brandTable)
            .where(and(eq(brandTable.tenantId, tid), eq(brandTable.active, true)))
            .orderBy(brandTable.name),
        );
        if (rows.length)
          return rows.map((row) => ({
            id: row.id,
            name: row.name,
            aliases: row.aliases,
            logo_url: row.logoUrl,
            active: row.active,
          }));
      } catch (error) {
        console.warn(
          '[catalog] relational brands unavailable',
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  const payload = await safePublicLegacy<{ brands?: Array<Record<string, unknown>> }>(
    'brands.list',
    {},
    { brands: [] },
  );
  return Array.isArray(payload.brands) ? payload.brands : [];
}

export async function getCategories() {
  if (databaseConfigured()) {
    const tid = await tenantId();
    if (tid) {
      try {
        const rows = await withDb((db) =>
          db
            .select()
            .from(categoryTable)
            .where(and(eq(categoryTable.tenantId, tid), eq(categoryTable.active, true)))
            .orderBy(categoryTable.name),
        );
        if (rows.length)
          return rows.map((row) => ({
            key: row.key,
            id: row.key,
            name: row.name,
            icon: row.icon,
            image_url: row.imageUrl,
            active: row.active,
          }));
      } catch (error) {
        console.warn(
          '[catalog] relational categories unavailable',
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  const payload = await safePublicLegacy<{ categories?: Array<Record<string, unknown>> }>(
    'categories.list',
    {},
    { categories: [] },
  );
  return Array.isArray(payload.categories) ? payload.categories : [];
}

/**
 * หมวดหมู่สำหรับ "แค็ตตาล็อก" (หน้า /products + ฟิลเตอร์) — ต้องตรงกับ bar/header เสมอ
 *
 * header (site/header.tsx) อ่าน categories.list แล้ว fallback เป็น FALLBACK_CATEGORIES
 * เมื่อหลังบ้านว่าง หน้า products เดิมใช้ getCategories() ตรง ๆ จึงได้ [] ทำให้ฟิลเตอร์
 * หมวดว่าง/ไม่ตรงกับ bar — ฟังก์ชันนี้คือคำตอบเดียว ("one answer") ให้ทั้งสองฝั่ง:
 * มีข้อมูลจริงใช้ของจริง, ว่างใช้ fallback ชุดเดียวกับ header (key/name/icon ตรงกัน)
 *
 * หมายเหตุ: หน้าแรก (homepage.ts) ตั้งใจใช้ getCategories() แบบดิบต่อ เพื่อให้ว่างแล้ว
 * ขึ้น placeholder ตามสเปก IMPORTANT_DATA_RULE — อย่าเปลี่ยนไปใช้ตัวนี้ที่หน้าแรก
 */
export async function getCatalogCategories() {
  const rows = await getCategories();
  if (Array.isArray(rows) && rows.length > 0) return rows;
  return FALLBACK_CATEGORIES.map((c) => ({
    key: c.key,
    id: c.key,
    name: c.name,
    en: c.en,
    icon: c.icon,
    image_url: '',
    product_count: null as number | null,
  }));
}
