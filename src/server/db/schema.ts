/**
 * The catalogue and the ledger, as tables.
 *
 * Everything this shop knows currently lives in one table — `app_kv`, with a
 * namespace, a key and a JSON blob, 1,786 rows of it. That has carried the shop
 * this far and most of it is fine: a settings record has no relations and does
 * not want any.
 *
 * One thing is not fine, and it is the reason this file exists.
 *
 * Stock is held as two numbers on a product record, `stock` and `reserved`, and
 * a checkout reads them, decides there is enough, and writes them back. Between
 * the read and the write there is nothing — no lock, because a key-value store
 * has nothing to lock. Two shoppers buying the last drill at the same moment
 * both read `stock: 1`, both decide yes, and both write `stock: 0`. The shop
 * sells one item twice and finds out when it tries to pack the second.
 *
 * `SELECT ... FOR UPDATE` inside a transaction is the fix, and it needs a real
 * relational database. The shop already has one — Supabase is PostgreSQL — it
 * has simply never been asked to be one.
 *
 * Scope, deliberately narrow: the things that need relations, constraints or
 * locks. Settings, content and sessions stay in app_kv, where they belong and
 * where they work.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Tenant id, on every row. The shop is multi-tenant and a query that forgets
 *  this is how one merchant's catalogue reaches another — a bug this project
 *  has had before, with a hardcoded fallback domain. */
const tenant = () => text('tenant_id').notNull();

export const categories = pgTable(
  'categories',
  {
    tenantId: tenant(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    imageUrl: text('image_url'),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const brands = pgTable(
  'brands',
  {
    tenantId: tenant(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    logoUrl: text('logo_url'),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);

export const products = pgTable(
  'catalog_products',
  {
    tenantId: tenant(),
    id: text('id').notNull(),
    sku: text('sku'),
    name: text('name').notNull(),
    slug: text('slug'),
    description: text('description'),
    brand: text('brand'),
    categoryKey: text('category_key'),
    barcode: text('barcode'),

    // Money as integer satang, never a float. 0.1 + 0.2 is not 0.3, and a price
    // that is out by a hundredth of a baht is a reconciliation the shop cannot
    // win. numeric would also do; an integer of the smallest unit cannot be got
    // wrong by accident.
    priceSatang: bigint('price_satang', { mode: 'number' }).notNull().default(0),
    oldPriceSatang: bigint('old_price_satang', { mode: 'number' }),

    /**
     * On hand, and spoken for. `available` is the difference and is never stored
     * — a derived number that is also written is a number that can disagree with
     * itself, which is exactly the class of bug this table exists to end.
     */
    stock: integer('stock').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),

    status: text('status').notNull().default('active'),
    imageUrl: text('image_url'),
    images: jsonb('images').$type<string[]>().notNull().default([]),
    detailImages: jsonb('detail_images').$type<string[]>().notNull().default([]),
    specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default({}),

    sourceId: text('source_id'),
    sourceUrl: text('source_url'),
    marketplaceSource: text('marketplace_source'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    // The storefront's three commonest filters. Without these a 5,000 SKU
    // catalogue sequentially scans on every category page.
    index('catalog_products_tenant_category_idx').on(t.tenantId, t.categoryKey),
    index('catalog_products_tenant_brand_idx').on(t.tenantId, t.brand),
    index('catalog_products_tenant_status_idx').on(t.tenantId, t.status),
    uniqueIndex('catalog_products_tenant_sku_idx').on(t.tenantId, t.sku),
    // Unanchored search. The B-tree indexes above cannot serve `LIKE '%makita%'`
    // — only an anchored prefix — so without this a catalogue search reads every
    // row. A GIN trigram index is the one kind Postgres can use for it, and the
    // same index answers `similarity()`, which is what makes a near miss
    // findable: one transposed letter, one missing tone mark, and a literal
    // comparison says the shop does not stock an item it stocks. Thai is covered
    // for the same reason — trigrams are computed over characters.
    //
    // pg_trgm is already installed; database/migrations/20260901120000 added it
    // for the app_kv-era product table and it is per-database, not per-table.
    index('catalog_products_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);

/**
 * The statuses the shop actually uses, taken from ORDER_TRANSITIONS in
 * shared/order-status.mjs rather than invented here.
 *
 * The first draft of this list was invented here — `pending`, `awaiting_payment`,
 * `preparing`, `delivered` — none of which the shop has ever written. The
 * migration's dry run is what caught it: three of the four live orders are
 * `completed` or `expired`, and the importer was about to record them all as
 * `pending`, turning finished orders into new ones. An enum is a constraint on
 * reality, so it has to be copied from reality.
 *
 * `new_cod` is deliberately absent: it is a lookup key the transition table
 * uses for a cash-on-delivery order sitting at `new`, not a status anything
 * stores.
 */
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'awaiting_verification',
  'new',
  'paid',
  'processing',
  'packing',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
  'expired',
]);

export const orders = pgTable(
  'orders',
  {
    tenantId: tenant(),
    id: text('id').notNull(),
    orderNo: text('order_no').notNull(),
    status: orderStatus('status').notNull().default('new'),

    customerId: text('customer_id'),
    name: text('name'),
    phone: text('phone'),
    address: text('address'),
    province: text('province'),
    zip: text('zip'),

    subtotalSatang: bigint('subtotal_satang', { mode: 'number' }).notNull().default(0),
    discountSatang: bigint('discount_satang', { mode: 'number' }).notNull().default(0),
    shippingSatang: bigint('shipping_satang', { mode: 'number' }).notNull().default(0),
    totalSatang: bigint('total_satang', { mode: 'number' }).notNull().default(0),

    paymentMethod: text('payment_method'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    couponCode: text('coupon_code'),
    agentCode: text('agent_code'),

    stockReserved: boolean('stock_reserved').notNull().default(false),
    stockDeducted: boolean('stock_deducted').notNull().default(false),
    reservationExpiresAt: timestamp('reservation_expires_at', { withTimezone: true }),

    /**
     * The key that makes placing an order safe to retry.
     *
     * A shopper on a bad connection presses "confirm", sees nothing happen, and
     * presses it again. Unique per tenant, so the second attempt collides with
     * the first instead of creating a second order for the same basket.
     */
    idempotencyKey: text('idempotency_key'),

    statusHistory: jsonb('status_history').$type<Array<Record<string, unknown>>>().notNull().default([]),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex('orders_tenant_order_no_idx').on(t.tenantId, t.orderNo),
    // Partial: the key is NULL on rows written before order.create persisted
    // it, and NULLs never collide — a plain unique index on this column
    // deduplicates nothing. Mirrors 20260914090000 (partial unique index).
    uniqueIndex('orders_tenant_idempotency_key_idx')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index('orders_tenant_status_idx').on(t.tenantId, t.status),
    index('orders_tenant_customer_idx').on(t.tenantId, t.customerId),
    // The sweep that releases expired reservations reads exactly this.
    index('orders_tenant_reservation_expiry_idx').on(t.tenantId, t.reservationExpiresAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    tenantId: tenant(),
    orderId: text('order_id').notNull(),
    lineNo: integer('line_no').notNull(),
    productId: text('product_id').notNull(),

    // Copied, not joined. What the shopper agreed to pay is a fact about the
    // order, and it must not change when somebody edits the product next week.
    sku: text('sku'),
    name: text('name').notNull(),
    unitPriceSatang: bigint('unit_price_satang', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalSatang: bigint('line_total_satang', { mode: 'number' }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.orderId, t.lineNo] }),
    foreignKey({
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'order_items_order_fk',
    }),
    index('order_items_product_idx').on(t.tenantId, t.productId),
    index('order_items_tenant_order_idx').on(t.tenantId, t.orderId),
  ],
);

export const stockMovement = pgEnum('stock_movement', ['reserve', 'release', 'deduct', 'restock', 'adjust']);

/**
 * Every change to stock, append-only.
 *
 * The two numbers on a product say where it stands; this says how it got there.
 * When the count is wrong — and eventually it is — the difference between a
 * shop that can find out why and one that cannot is whether this table exists.
 * Nothing updates or deletes a row here.
 */
export const stockLedger = pgTable(
  'stock_ledger',
  {
    tenantId: tenant(),
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity(),
    productId: text('product_id').notNull(),
    movement: stockMovement('movement').notNull(),
    quantity: integer('quantity').notNull(),
    stockAfter: integer('stock_after').notNull(),
    reservedAfter: integer('reserved_after').notNull(),
    orderId: text('order_id'),
    reason: text('reason'),
    actor: text('actor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'stock_ledger_order_fk',
    }),
    index('stock_ledger_product_idx').on(t.tenantId, t.productId, t.createdAt),
    index('stock_ledger_order_idx').on(t.tenantId, t.orderId),
  ],
);

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;

/**
 * Curated equipment bundles created by the shop. These are native Next-era
 * entities rather than compatibility KV records: they need referential shape,
 * stable ordering and atomic edits across the set and its lines.
 */
export const equipmentSets = pgTable(
  'equipment_sets',
  {
    tenantId: tenant(),
    id: text('id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft'),
    imageUrl: text('image_url'),
    discountType: text('discount_type').notNull().default('none'),
    discountValue: numeric('discount_value', { precision: 12, scale: 2 }).notNull().default('0'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex('equipment_sets_tenant_slug_idx').on(t.tenantId, t.slug),
    index('equipment_sets_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

export const equipmentSetItems = pgTable(
  'equipment_set_items',
  {
    tenantId: tenant(),
    setId: text('set_id').notNull(),
    lineNo: integer('line_no').notNull(),
    productId: text('product_id').notNull(),
    variantId: text('variant_id'),
    quantity: integer('quantity').notNull().default(1),
    required: boolean('required').notNull().default(true),
    note: text('note'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.setId, t.lineNo] }),
    foreignKey({
      columns: [t.tenantId, t.setId],
      foreignColumns: [equipmentSets.tenantId, equipmentSets.id],
      name: 'equipment_set_items_set_fk',
    }),
    index('equipment_set_items_product_idx').on(t.tenantId, t.productId),
    index('equipment_set_items_tenant_set_idx').on(t.tenantId, t.setId),
  ],
);

export type EquipmentSet = typeof equipmentSets.$inferSelect;
export type EquipmentSetItem = typeof equipmentSetItems.$inferSelect;

/** Issued tax invoices are immutable financial records linked to an order. */
export const taxInvoices = pgTable(
  'tax_invoices',
  {
    tenantId: tenant(),
    id: text('id').notNull(),
    orderId: text('order_id').notNull(),
    invoiceNo: text('invoice_no').notNull(),
    invoiceType: text('invoice_type').notNull().default('full_tax_invoice'),
    customerName: text('customer_name').notNull(),
    taxId: text('tax_id'),
    branch: text('branch'),
    address: text('address'),
    subtotalSatang: bigint('subtotal_satang', { mode: 'number' }).notNull().default(0),
    vatSatang: bigint('vat_satang', { mode: 'number' }).notNull().default(0),
    totalSatang: bigint('total_satang', { mode: 'number' }).notNull().default(0),
    pdfObjectKey: text('pdf_object_key'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    foreignKey({
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'tax_invoices_order_fk',
    }),
    uniqueIndex('tax_invoices_tenant_invoice_no_idx').on(t.tenantId, t.invoiceNo),
    uniqueIndex('tax_invoices_tenant_order_idx').on(t.tenantId, t.orderId),
  ],
);

/** Small, privacy-conscious telemetry for AI cost and reliability operations. */
export const aiUsageLogs = pgTable(
  'ai_usage_logs',
  {
    id: text('id').notNull(),
    tenantId: text('tenant_id').notNull(),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    fallback: boolean('fallback').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('ai_usage_logs_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('ai_usage_logs_tenant_feature_created_idx').on(t.tenantId, t.feature, t.createdAt),
  ],
);

export type TaxInvoice = typeof taxInvoices.$inferSelect;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
