import { and, eq, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { products, equipmentSetItems, equipmentSets } from '@/server/db/schema';
import { databaseConfigured, withDb } from '@/server/db/client';
import { resolveRequestTenant } from '@/server/request-tenant';
import { kitQuoteSigningConfigured, signKitQuote } from '@/shared/kit-quote.mjs';

const requestSchema = z.object({
  setId: z.string().trim().min(1).max(100),
  items: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    variant_id: z.string().trim().max(200).optional().default(''),
    qty: z.coerce.number().int().min(1).max(999),
  })).min(1).max(200),
});

function fail(error: string, status: number, detail?: unknown) {
  return Response.json({ ok: false, error, ...(detail === undefined ? {} : { detail }) }, { status });
}

function matchedQty(cart: z.infer<typeof requestSchema>['items'], productId: string, variantId = '') {
  return cart
    .filter((item) => item.id === productId && (!variantId || item.variant_id === variantId))
    .reduce((sum, item) => sum + item.qty, 0);
}

export async function POST(request: NextRequest) {
  if (!databaseConfigured()) return fail('database_not_configured', 503);
  if (!kitQuoteSigningConfigured()) return fail('kit_quote_signing_not_configured', 503, 'Set KIT_QUOTE_SECRET or AUTH_SECRET.');

  const tenant = resolveRequestTenant(request);
  if (!tenant.ok) return fail(tenant.error, 421);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('invalid_input', 422, parsed.error.flatten());
  const input = parsed.data;

  const result = await withDb(async (db) => {
    const [set] = await db.select().from(equipmentSets).where(and(
      eq(equipmentSets.tenantId, tenant.tenant.id),
      eq(equipmentSets.id, input.setId),
      eq(equipmentSets.status, 'active'),
    )).limit(1);
    if (!set) return { error: 'kit_not_found' as const };

    const setItems = await db.select().from(equipmentSetItems).where(and(
      eq(equipmentSetItems.tenantId, tenant.tenant.id),
      eq(equipmentSetItems.setId, set.id),
    ));
    if (!setItems.length) return { error: 'kit_empty' as const };

    const missing = setItems.filter((line) => line.required && matchedQty(input.items, line.productId, String(line.variantId || '')) < line.quantity);
    if (missing.length) {
      return {
        error: 'kit_requirements_not_met' as const,
        missing: missing.map((line) => ({ productId: line.productId, variantId: line.variantId || '', quantity: line.quantity })),
      };
    }

    const claimed = setItems.flatMap((line) => {
      const qty = Math.min(line.quantity, matchedQty(input.items, line.productId, String(line.variantId || '')));
      if (qty <= 0) return [];
      return [{ id: line.productId, variant_id: String(line.variantId || ''), qty }];
    });
    const productIds = [...new Set(claimed.map((line) => line.id))];
    const rows = productIds.length
      ? await db.select({ id: products.id, priceSatang: products.priceSatang, status: products.status }).from(products).where(and(
          eq(products.tenantId, tenant.tenant.id),
          inArray(products.id, productIds),
        ))
      : [];
    const priceMap = new Map(rows.map((row) => [row.id, row]));

    let eligibleSubtotal = 0;
    const unavailable: string[] = [];
    for (const line of claimed) {
      const product = priceMap.get(line.id);
      if (!product || product.status !== 'active') {
        unavailable.push(line.id);
        continue;
      }
      eligibleSubtotal += (Number(product.priceSatang || 0) / 100) * line.qty;
    }
    if (unavailable.length) return { error: 'kit_product_unavailable' as const, unavailable };
    if (!(eligibleSubtotal > 0)) return { error: 'kit_subtotal_zero' as const };

    const discountType = String(set.discountType || 'none');
    const discountValue = Math.max(0, Number(set.discountValue || 0));
    let discountAmount = 0;
    if (discountType === 'percent') discountAmount = eligibleSubtotal * (Math.min(100, discountValue) / 100);
    if (discountType === 'fixed') discountAmount = Math.min(eligibleSubtotal, discountValue);
    discountAmount = Math.max(0, Math.min(eligibleSubtotal, Math.round(discountAmount * 100) / 100));

    return { set, claimed, eligibleSubtotal, discountAmount };
  });

  if (result && typeof result === 'object' && 'error' in result) {
    const code = String((result as { error?: unknown }).error ?? 'kit_quote_failed');
    const status = code === 'kit_requirements_not_met' ? 409 : code === 'kit_not_found' ? 404 : 422;
    return fail(code, status, result);
  }

  const token = signKitQuote({
    tenant: tenant.tenant.id,
    set_id: result.set.id,
    set_name: result.set.name,
    discount_amount: result.discountAmount,
    eligible_subtotal: result.eligibleSubtotal,
    items: result.claimed,
  });

  return Response.json({
    ok: true,
    set: { id: result.set.id, slug: result.set.slug, name: result.set.name },
    eligible_subtotal: result.eligibleSubtotal,
    discount_type: result.set.discountType,
    discount_value: Number(result.set.discountValue || 0),
    discount: result.discountAmount,
    token,
    expires_in: 600,
  }, { headers: { 'cache-control': 'no-store' } });
}
