import 'server-only';

import { and, asc, desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { resolveTenant } from '@/legacy-api/lib/tenants.js';
import { databaseConfigured, withDb } from '@/server/db/client';
import { equipmentSetItems, equipmentSets } from '@/server/db/schema';

export type PublicEquipmentSet = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  items: Array<{ productId: string; variantId?: string | null; quantity: number; required: boolean; note: string }>;
};

async function currentTenantId() {
  const incoming = await headers();
  const host = String(incoming.get('x-forwarded-host') || incoming.get('host') || 'localhost').split(',')[0].trim().replace(/:\d+$/, '');
  const tenant = resolveTenant(host) as { id?: string } | null;
  return String(tenant?.id || '').trim();
}

export async function getPublicEquipmentSets(limit = 12): Promise<PublicEquipmentSet[]> {
  if (!databaseConfigured()) return [];
  const tenantId = await currentTenantId();
  if (!tenantId) return [];
  try {
    return await withDb(async (db) => {
      const rows = await db.select().from(equipmentSets)
        .where(and(eq(equipmentSets.tenantId, tenantId), eq(equipmentSets.status, 'active')))
        .orderBy(desc(equipmentSets.updatedAt)).limit(Math.max(1, Math.min(50, limit)));
      if (!rows.length) return [];
      const items = await db.select().from(equipmentSetItems)
        .where(eq(equipmentSetItems.tenantId, tenantId))
        .orderBy(asc(equipmentSetItems.setId), asc(equipmentSetItems.lineNo));
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: String(row.description || ''),
        imageUrl: String(row.imageUrl || ''),
        discountType: (['percent', 'fixed'].includes(String(row.discountType)) ? String(row.discountType) : 'none') as 'none' | 'percent' | 'fixed',
        discountValue: Math.max(0, Number(row.discountValue || 0)),
        items: items.filter((item) => item.setId === row.id).map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          required: item.required,
          note: String(item.note || ''),
        })),
      }));
    });
  } catch (error) {
    console.warn('[equipment-kits] public set load failed', error instanceof Error ? error.message : error);
    return [];
  }
}
