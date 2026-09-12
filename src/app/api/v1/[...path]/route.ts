import { and, asc, eq, gt, notInArray, or, sql } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { withDb } from '@/server/db/client';
import { brands, categories, equipmentSetItems, equipmentSets, products } from '@/server/db/schema';
import { HIDDEN_STATES } from '@/shared/product-visibility.mjs';
import { resolveRequestTenant } from '@/server/request-tenant';

type Ctx = { params: Promise<{ path: string[] }> };

const cacheHeaders = (seconds: number) => ({
  'cache-control': `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=86400`,
});
const json = (body: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(body, { status, headers });
const fail = (error: string, status: number, detail?: unknown) => json({ ok: false, error, ...(detail === undefined ? {} : { detail }) }, status);
const limitOf = (raw: string | null, fallback: number, max: number) => Math.min(max, Math.max(1, Number(raw) || fallback));
const shapeProduct = (p: typeof products.$inferSelect) => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  slug: p.slug,
  brand: p.brand,
  category: p.categoryKey,
  price: p.priceSatang / 100,
  old_price: p.oldPriceSatang == null ? null : p.oldPriceSatang / 100,
  available: Math.max(0, p.stock - p.reserved),
  img: p.imageUrl,
  images: p.images,
});

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const [resource, key] = path;
  if (!process.env.DATABASE_URL && resource !== 'health' && resource !== undefined) {
    return fail('database_not_configured', 503, 'Set DATABASE_URL. The compatibility API at /api remains available.');
  }

  try {
    if (!resource) {
      return json({
        ok: true,
        api: 'v1',
        database: process.env.DATABASE_URL ? 'configured' : 'not-configured',
        endpoints: [
          '/api/v1/health', '/api/v1/products', '/api/v1/products/:idOrSlug', '/api/v1/stock/:idOrSlug',
          '/api/v1/search?q=', '/api/v1/categories', '/api/v1/brands', '/api/v1/kits', '/api/v1/kits/:idOrSlug',
        ],
      }, 200, cacheHeaders(600));
    }
    if (resource === 'health') {
      return json({ ok: true, api: 'v1', database: process.env.DATABASE_URL ? 'configured' : 'not-configured', time: new Date().toISOString() });
    }

    const resolvedTenant = resolveRequestTenant(request);
    if (!resolvedTenant.ok) {
      return fail(resolvedTenant.error, 421, resolvedTenant.error === 'tenant_mismatch'
        ? 'The requested tenant does not belong to this hostname.'
        : 'This hostname is not assigned to a tenant.');
    }
    const tenantId = resolvedTenant.tenant.id;
    if (resource === 'products' && key) {
      const [row] = await withDb((db) => db.select().from(products).where(and(
        eq(products.tenantId, tenantId),
        or(eq(products.id, key), eq(products.slug, key)),
      )).limit(1));
      if (!row) return fail('not_found', 404, key);
      return json({
        ok: true,
        product: { ...shapeProduct(row), description: row.description, barcode: row.barcode, detail_images: row.detailImages, specs: row.specs, stock: row.stock, reserved: row.reserved, updated_at: row.updatedAt },
      }, 200, cacheHeaders(30));
    }
    if (resource === 'products') {
      const limit = limitOf(request.nextUrl.searchParams.get('limit'), 50, 200);
      const category = request.nextUrl.searchParams.get('category')?.trim();
      const brand = request.nextUrl.searchParams.get('brand')?.trim();
      const cursor = request.nextUrl.searchParams.get('cursor')?.trim();
      const where = [eq(products.tenantId, tenantId), notInArray(products.status, [...HIDDEN_STATES])];
      if (category) where.push(eq(products.categoryKey, category));
      if (brand) where.push(eq(products.brand, brand));
      if (cursor) where.push(gt(products.id, cursor));
      const rows = await withDb((db) => db.select().from(products).where(and(...where)).orderBy(asc(products.id)).limit(limit + 1));
      const page = rows.slice(0, limit);
      return json({ ok: true, products: page.map(shapeProduct), next_cursor: rows.length > limit ? page.at(-1)?.id ?? null : null }, 200, cacheHeaders(60));
    }
    if (resource === 'stock' && key) {
      const [row] = await withDb((db) => db.select({ id: products.id, sku: products.sku, name: products.name, stock: products.stock, reserved: products.reserved, status: products.status })
        .from(products).where(and(eq(products.tenantId, tenantId), or(eq(products.id, key), eq(products.slug, key)))).limit(1));
      if (!row) return fail('not_found', 404, key);
      const available = Math.max(0, row.stock - row.reserved);
      return json({ ok: true, stock: { id: row.id, sku: row.sku, name: row.name, available, on_hand: row.stock, reserved: row.reserved, sellable: row.status === 'active' && available > 0 } }, 200, cacheHeaders(10));
    }
    if (resource === 'search') {
      const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 120) || '';
      if (query.length < 2) return fail('query_too_short', 422, 'At least two characters.');
      const limit = limitOf(request.nextUrl.searchParams.get('limit'), 20, 50);
      const live = and(eq(products.tenantId, tenantId), notInArray(products.status, [...HIDDEN_STATES]));
      const { rows, matched } = await withDb(async (db) => {
        const exact = await db.select().from(products).where(and(live, sql`${products.name} ILIKE ${`%${query}%`}`)).limit(limit);
        if (exact.length >= limit) return { rows: exact, matched: 'exact' as const };
        try {
          const seen = new Set(exact.map((row) => row.id));
          const similar = await db.select().from(products).where(and(live, sql`similarity(${products.name}, ${query}) > 0.25`))
            .orderBy(sql`similarity(${products.name}, ${query}) DESC`).limit(limit);
          const extra = similar.filter((row) => !seen.has(row.id));
          return { rows: [...exact, ...extra].slice(0, limit), matched: exact.length ? 'exact' as const : extra.length ? 'similar' as const : 'none' as const };
        } catch {
          return { rows: exact, matched: exact.length ? 'exact' as const : 'none' as const };
        }
      });
      return json({ ok: true, query, matched, products: rows.map(shapeProduct) }, 200, cacheHeaders(30));
    }
    if (resource === 'kits' && key) {
      const [set] = await withDb((db) => db.select().from(equipmentSets).where(and(
        eq(equipmentSets.tenantId, tenantId),
        eq(equipmentSets.status, 'active'),
        or(eq(equipmentSets.id, key), eq(equipmentSets.slug, key)),
      )).limit(1));
      if (!set) return fail('not_found', 404, key);
      const items = await withDb((db) => db.select().from(equipmentSetItems).where(and(
        eq(equipmentSetItems.tenantId, tenantId),
        eq(equipmentSetItems.setId, set.id),
      )).orderBy(asc(equipmentSetItems.lineNo)));
      return json({ ok: true, kit: {
        id: set.id, slug: set.slug, name: set.name, description: set.description || '', image_url: set.imageUrl || '',
        discount_type: set.discountType, discount_value: Number(set.discountValue || 0), seo_title: set.seoTitle || '', seo_description: set.seoDescription || '',
        items: items.map((item) => ({ product_id: item.productId, variant_id: item.variantId || '', quantity: item.quantity, required: item.required, note: item.note || '' })),
      } }, 200, cacheHeaders(60));
    }
    if (resource === 'kits') {
      const limit = limitOf(request.nextUrl.searchParams.get('limit'), 24, 100);
      const rows = await withDb((db) => db.select().from(equipmentSets).where(and(
        eq(equipmentSets.tenantId, tenantId),
        eq(equipmentSets.status, 'active'),
      )).orderBy(asc(equipmentSets.name)).limit(limit));
      return json({ ok: true, kits: rows.map((set) => ({
        id: set.id, slug: set.slug, name: set.name, description: set.description || '', image_url: set.imageUrl || '',
        discount_type: set.discountType, discount_value: Number(set.discountValue || 0),
      })) }, 200, cacheHeaders(120));
    }

    if (resource === 'categories') {
      const rows = await withDb((db) => db.select().from(categories).where(and(eq(categories.tenantId, tenantId), eq(categories.active, true))).orderBy(asc(categories.name)));
      return json({ ok: true, categories: rows.map((row) => ({ key: row.key, name: row.name, icon: row.icon, image: row.imageUrl })) }, 200, cacheHeaders(300));
    }
    if (resource === 'brands') {
      const rows = await withDb((db) => db.select().from(brands).where(and(eq(brands.tenantId, tenantId), eq(brands.active, true))).orderBy(asc(brands.name)));
      return json({ ok: true, brands: rows.map((row) => ({ id: row.id, name: row.name, logo: row.logoUrl, aliases: row.aliases })) }, 200, cacheHeaders(300));
    }
    return fail('not_found', 404, request.nextUrl.pathname);
  } catch (error) {
    console.error('[api/v1]', error);
    return fail('internal_error', 500, error instanceof Error ? error.message : undefined);
  }
}
