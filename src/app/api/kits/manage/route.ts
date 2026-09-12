import { and, asc, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getLegacySession } from '@/server/auth/legacy-session';
import { databaseConfigured, withDb } from '@/server/db/client';
import { equipmentSetItems, equipmentSets } from '@/server/db/schema';
import { resolveRequestTenant } from '@/server/request-tenant';

const lineSchema = z.object({
  productId: z.string().trim().min(1).max(200),
  variantId: z.string().trim().max(200).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  required: z.boolean().default(true),
  note: z.string().trim().max(500).optional().default(''),
});

const setSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(3000).optional().default(''),
  status: z.enum(['draft', 'active', 'hidden']).default('draft'),
  imageUrl: z.string().trim().max(2000).optional().default(''),
  discountType: z.enum(['none', 'percent', 'fixed']).default('none'),
  discountValue: z.coerce.number().min(0).max(10_000_000).default(0),
  seoTitle: z.string().trim().max(200).optional().default(''),
  seoDescription: z.string().trim().max(500).optional().default(''),
  items: z.array(lineSchema).max(100).default([]),
});

async function adminAllowed() {
  const session = await getLegacySession();
  return Boolean(session.admin);
}

function tenantOrResponse(request: NextRequest) {
  const result = resolveRequestTenant(request);
  if (!result.ok) return { response: Response.json({ ok: false, error: result.error }, { status: 421 }) } as const;
  return { tenantId: result.tenant.id } as const;
}

export async function GET(request: NextRequest) {
  const tenant = tenantOrResponse(request);
  if ('response' in tenant) return tenant.response;
  if (!databaseConfigured()) return Response.json({ ok: false, error: 'database_not_configured', sets: [] }, { status: 503 });

  const wantsAdmin = request.nextUrl.searchParams.get('admin') === '1';
  if (wantsAdmin && !(await adminAllowed())) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const id = String(request.nextUrl.searchParams.get('id') || '').trim();

  const result = await withDb(async (db) => {
    const rows = id
      ? await db.select().from(equipmentSets).where(and(eq(equipmentSets.tenantId, tenant.tenantId), eq(equipmentSets.id, id))).limit(1)
      : await db.select().from(equipmentSets).where(wantsAdmin ? eq(equipmentSets.tenantId, tenant.tenantId) : and(eq(equipmentSets.tenantId, tenant.tenantId), eq(equipmentSets.status, 'active'))).orderBy(desc(equipmentSets.updatedAt));
    const setIds = rows.map((row) => row.id);
    const items = setIds.length
      ? await db.select().from(equipmentSetItems).where(eq(equipmentSetItems.tenantId, tenant.tenantId)).orderBy(asc(equipmentSetItems.setId), asc(equipmentSetItems.lineNo))
      : [];
    return rows.map((row) => ({ ...row, items: items.filter((item) => item.setId === row.id) }));
  });

  return Response.json({ ok: true, sets: result });
}

export async function POST(request: NextRequest) {
  const tenant = tenantOrResponse(request);
  if ('response' in tenant) return tenant.response;
  if (!(await adminAllowed())) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!databaseConfigured()) return Response.json({ ok: false, error: 'database_not_configured' }, { status: 503 });
  const parsed = setSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: 'invalid_input', issues: parsed.error.flatten() }, { status: 422 });

  const input = parsed.data;
  const id = input.id || crypto.randomUUID();
  try {
    await withDb(async (db) => {
      await db.transaction(async (tx) => {
        const existing = await tx.select({ id: equipmentSets.id }).from(equipmentSets).where(and(eq(equipmentSets.tenantId, tenant.tenantId), eq(equipmentSets.id, id))).limit(1);
        const values = {
          tenantId: tenant.tenantId,
          id,
          slug: input.slug,
          name: input.name,
          description: input.description || null,
          status: input.status,
          imageUrl: input.imageUrl || null,
          discountType: input.discountType,
          discountValue: String(input.discountValue),
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          updatedAt: new Date(),
        };
        if (existing.length) await tx.update(equipmentSets).set(values).where(and(eq(equipmentSets.tenantId, tenant.tenantId), eq(equipmentSets.id, id)));
        else await tx.insert(equipmentSets).values(values);
        await tx.delete(equipmentSetItems).where(and(eq(equipmentSetItems.tenantId, tenant.tenantId), eq(equipmentSetItems.setId, id)));
        if (input.items.length) {
          await tx.insert(equipmentSetItems).values(input.items.map((item, index) => ({
            tenantId: tenant.tenantId,
            setId: id,
            lineNo: index + 1,
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            required: item.required,
            note: item.note || null,
          })));
        }
      });
    });
    return Response.json({ ok: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'save_failed';
    const conflict = /equipment_sets_tenant_slug_idx|duplicate key/i.test(message);
    return Response.json({ ok: false, error: conflict ? 'slug_exists' : 'save_failed', detail: message }, { status: conflict ? 409 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const tenant = tenantOrResponse(request);
  if ('response' in tenant) return tenant.response;
  if (!(await adminAllowed())) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!databaseConfigured()) return Response.json({ ok: false, error: 'database_not_configured' }, { status: 503 });
  const id = String(request.nextUrl.searchParams.get('id') || '').trim();
  if (!id) return Response.json({ ok: false, error: 'id_required' }, { status: 422 });
  await withDb(async (db) => {
    await db.transaction(async (tx) => {
      await tx.delete(equipmentSetItems).where(and(eq(equipmentSetItems.tenantId, tenant.tenantId), eq(equipmentSetItems.setId, id)));
      await tx.delete(equipmentSets).where(and(eq(equipmentSets.tenantId, tenant.tenantId), eq(equipmentSets.id, id)));
    });
  });
  return Response.json({ ok: true });
}
