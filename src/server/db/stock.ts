/**
 * Reserving stock so that two shoppers cannot be sold the same last item.
 *
 * This is the reason the relational schema exists, so it is worth being exact
 * about what was wrong.
 *
 * The key-value version reads a product, decides whether `stock - reserved` is
 * enough, and writes the record back. Between the read and the write there is
 * no lock, because there is nothing in a key-value store to lock. Two checkouts
 * for the last drill interleave like this:
 *
 *     A reads  stock 1, reserved 0  → available 1 → yes
 *     B reads  stock 1, reserved 0  → available 1 → yes
 *     A writes reserved 1
 *     B writes reserved 1           ← overwrites A's, not added to it
 *
 * Both shoppers are told they have it. The shop finds out when it packs the
 * second one. No amount of care in the application layer fixes this; the check
 * and the write have to be one indivisible step, and only the database can make
 * them one.
 *
 * Two things do that here, and both matter:
 *
 *   1. `SELECT ... FOR UPDATE` takes a row lock. The second transaction blocks
 *      at the SELECT until the first commits, and then reads what the first
 *      wrote rather than what it read.
 *   2. Every product in the basket is locked in a fixed order — sorted by id.
 *      Two baskets holding the same two products in opposite orders would
 *      otherwise each hold what the other wants, and Postgres would break the
 *      deadlock by killing one of them. Sorting means everybody queues the same
 *      way, so nobody deadlocks.
 *
 * The whole thing runs in one transaction. Either every line is reserved and
 * the ledger records it, or nothing happened at all.
 */
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

export interface ReservationLine {
  productId: string;
  quantity: number;
}

export type ReservationResult =
  | { ok: true; reserved: ReservationLine[] }
  | {
      ok: false;
      error: 'insufficient_stock';
      productId: string;
      sku: string | null;
      requested: number;
      available: number;
    }
  | { ok: false; error: 'unknown_product'; productId: string }
  | { ok: false; error: 'invalid_quantity'; productId: string };

/**
 * Hold stock for an order, or hold nothing and say why.
 *
 * `available` is computed here rather than stored, because a derived number
 * that is also written is a number that can disagree with itself.
 */
export async function reserveStock(
  db: Db,
  tenantId: string,
  orderId: string,
  lines: ReservationLine[],
): Promise<ReservationResult> {
  // Collapse a basket that names the same product twice: two lines of one is a
  // reservation of two, and checking them separately would pass both against
  // the same single unit.
  const wanted = new Map<string, number>();
  for (const line of lines) {
    const quantity = Math.trunc(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: 'invalid_quantity', productId: line.productId };
    }
    wanted.set(line.productId, (wanted.get(line.productId) || 0) + quantity);
  }

  // The fixed order that stops two baskets deadlocking against each other.
  const ids = [...wanted.keys()].sort();

  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      id: string; sku: string | null; stock: number; reserved: number;
    }>(sql`
      SELECT id, sku, stock, reserved
        FROM ${schema.products}
       WHERE tenant_id = ${tenantId}
         AND id = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',') || 'NULL'}]::text[]`)})
       ORDER BY id
         FOR UPDATE
    `);

    const rows = new Map((locked as unknown as any[]).map((r) => [String(r.id), r]));

    for (const id of ids) {
      const row = rows.get(id);
      if (!row) return { ok: false, error: 'unknown_product', productId: id } as const;
      const quantity = wanted.get(id)!;
      const available = Number(row.stock) - Number(row.reserved);
      if (available < quantity) {
        return {
          ok: false, error: 'insufficient_stock', productId: id,
          sku: row.sku ?? null, requested: quantity, available: Math.max(0, available),
        } as const;
      }
    }

    // Every line has passed against rows nobody else can move until this
    // transaction ends, so the writes cannot be raced.
    for (const id of ids) {
      const quantity = wanted.get(id)!;
      const row = rows.get(id)!;
      const reservedAfter = Number(row.reserved) + quantity;

      await tx.execute(sql`
        UPDATE ${schema.products}
           SET reserved = ${reservedAfter}, updated_at = now()
         WHERE tenant_id = ${tenantId} AND id = ${id}
      `);

      await tx.insert(schema.stockLedger).values({
        tenantId, productId: id, movement: 'reserve', quantity,
        stockAfter: Number(row.stock), reservedAfter,
        orderId, reason: 'checkout', actor: 'system',
      });
    }

    return { ok: true, reserved: ids.map((id) => ({ productId: id, quantity: wanted.get(id)! })) } as const;
  });
}

/**
 * Give back stock an order was holding and did not buy — a cancellation, or a
 * reservation nobody came back for.
 *
 * Clamped at zero. A release that would drive `reserved` negative means the
 * ledger and the counter have already disagreed somewhere, and turning that
 * into a negative number would hide it inside a column that is supposed to be a
 * count of things. The ledger keeps the true story either way.
 */
export async function releaseStock(db: Db, tenantId: string, orderId: string): Promise<{ released: number }> {
  return db.transaction(async (tx) => {
    const held = await tx.execute<{ product_id: string; quantity: number }>(sql`
      SELECT product_id, quantity
        FROM ${schema.orderItems}
       WHERE tenant_id = ${tenantId} AND order_id = ${orderId}
       ORDER BY product_id
    `);

    let released = 0;
    for (const line of held as unknown as any[]) {
      const rows = await tx.execute<{ stock: number; reserved: number }>(sql`
        SELECT stock, reserved FROM ${schema.products}
         WHERE tenant_id = ${tenantId} AND id = ${line.product_id}
           FOR UPDATE
      `);
      const row = (rows as unknown as any[])[0];
      if (!row) continue;

      const quantity = Number(line.quantity);
      const reservedAfter = Math.max(0, Number(row.reserved) - quantity);

      await tx.execute(sql`
        UPDATE ${schema.products} SET reserved = ${reservedAfter}, updated_at = now()
         WHERE tenant_id = ${tenantId} AND id = ${line.product_id}
      `);
      await tx.insert(schema.stockLedger).values({
        tenantId, productId: line.product_id, movement: 'release', quantity,
        stockAfter: Number(row.stock), reservedAfter,
        orderId, reason: 'released', actor: 'system',
      });
      released += quantity;
    }

    await tx.execute(sql`
      UPDATE ${schema.orders}
         SET stock_reserved = false, reservation_expires_at = NULL, updated_at = now()
       WHERE tenant_id = ${tenantId} AND id = ${orderId}
    `);

    return { released };
  });
}

/**
 * Turn a held reservation into a sale: the goods have left, so they come off
 * `stock` as well as off `reserved`.
 *
 * Guarded against running twice — a payment webhook that arrives in duplicate
 * would otherwise deduct the same order's stock a second time.
 */
export async function deductStock(db: Db, tenantId: string, orderId: string): Promise<{ deducted: number }> {
  return db.transaction(async (tx) => {
    const orderRows = await tx.execute<{ stock_deducted: boolean }>(sql`
      SELECT stock_deducted FROM ${schema.orders}
       WHERE tenant_id = ${tenantId} AND id = ${orderId}
         FOR UPDATE
    `);
    const order = (orderRows as unknown as any[])[0];
    if (!order || order.stock_deducted) return { deducted: 0 };

    const held = await tx.execute<{ product_id: string; quantity: number }>(sql`
      SELECT product_id, quantity FROM ${schema.orderItems}
       WHERE tenant_id = ${tenantId} AND order_id = ${orderId}
       ORDER BY product_id
    `);

    let deducted = 0;
    for (const line of held as unknown as any[]) {
      const rows = await tx.execute<{ stock: number; reserved: number }>(sql`
        SELECT stock, reserved FROM ${schema.products}
         WHERE tenant_id = ${tenantId} AND id = ${line.product_id}
           FOR UPDATE
      `);
      const row = (rows as unknown as any[])[0];
      if (!row) continue;

      const quantity = Number(line.quantity);
      const stockAfter = Number(row.stock) - quantity;
      const reservedAfter = Math.max(0, Number(row.reserved) - quantity);

      await tx.execute(sql`
        UPDATE ${schema.products}
           SET stock = ${stockAfter}, reserved = ${reservedAfter}, updated_at = now()
         WHERE tenant_id = ${tenantId} AND id = ${line.product_id}
      `);
      await tx.insert(schema.stockLedger).values({
        tenantId, productId: line.product_id, movement: 'deduct', quantity,
        stockAfter, reservedAfter, orderId, reason: 'paid', actor: 'system',
      });
      deducted += quantity;
    }

    await tx.execute(sql`
      UPDATE ${schema.orders}
         SET stock_deducted = true, stock_reserved = false,
             reservation_expires_at = NULL, updated_at = now()
       WHERE tenant_id = ${tenantId} AND id = ${orderId}
    `);

    return { deducted };
  });
}
