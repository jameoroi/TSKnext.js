/**
 * Whether the shop shows a product, in one place.
 *
 * ## Why this exists
 *
 * A KV product record carries two fields that both read like a status:
 *
 *   - `state`  — the lifecycle. `api/api.js` filters the catalogue on it in
 *                four separate places, always as
 *                `p.state !== 'hidden' && p.state !== 'discontinued'`.
 *   - `status` — free text the shop uses as a **badge**. On this catalogue
 *                1,016 of 2,143 products carry the value `"สินค้าใหม่"`,
 *                which is a label a shopper reads, not a lifecycle.
 *
 * `scripts/migrate-kv-to-postgres.mjs` copied `status` into the relational
 * `products.status` column, and `/api/v1/products` filters that column on
 * `= 'active'`. So every product wearing the "new arrival" badge vanished from
 * the relational copy: 1,127 of 2,143 rows visible, a 47.6% drift that three
 * re-runs of the importer could not shift, because the importer was faithfully
 * copying the wrong field each time.
 *
 * The rule below is the shop's own rule, transcribed rather than invented, so
 * the relational copy reproduces the decision the storefront already makes.
 */

/** Lifecycle values that take a product off the storefront. */
export const HIDDEN_STATES = Object.freeze(['hidden', 'discontinued']);

/**
 * The lifecycle status to store for a KV product record.
 *
 * Anything that is not explicitly hidden or discontinued is on sale — that is
 * the storefront's rule, including for records whose `state` is missing or
 * unrecognised, which the shop has always treated as sellable.
 *
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {'active' | 'hidden' | 'discontinued'}
 */
export function lifecycleStatus(product) {
  const state = String(product?.state ?? '').trim().toLowerCase();
  return HIDDEN_STATES.includes(state) ? /** @type {'hidden'|'discontinued'} */ (state) : 'active';
}

/** Whether the storefront would list this KV product record. */
export function isVisible(product) {
  return lifecycleStatus(product) === 'active';
}
