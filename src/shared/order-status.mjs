/**
 * Which order status can follow which.
 *
 * The rule lives in api/api.js (`orderTransitionAllowed`) and is
 * mirrored here so the console can grey out the buttons that cannot work,
 * rather than letting an operator press one and receive
 * `invalid_order_transition` as a raw code. A completed order, for instance,
 * can only be refunded — every other button on that row is a dead end.
 *
 * scripts/r91-purchase-order.test.mjs compares this table against the server's
 * so the two cannot drift.
 *
 * Plain `.mjs` with JSDoc so the test can import it under node without a
 * type-stripping flag.
 */

/** @type {Record<string, string[]>} */
export const ORDER_TRANSITIONS = {
  pending_payment: ['awaiting_verification', 'paid', 'cancelled', 'expired'],
  awaiting_verification: ['paid', 'cancelled', 'expired'],
  // A cash-on-delivery order is not paid up front, so it goes straight to work.
  new: ['paid', 'cancelled', 'expired'],
  new_cod: ['processing', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['packing', 'cancelled', 'refunded'],
  packing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['completed', 'refunded'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
  expired: [],
};

const isCod = (paymentMethod) => /COD|ปลายทาง/i.test(String(paymentMethod || ''));

/**
 * @param {{status?: string, payment_method?: string}} order
 * @param {string} next
 * @returns {boolean}
 */
export function canMoveTo(order, next) {
  const current = String(order?.status || '');
  if (current === next) return true;
  const key = current === 'new' && isCod(order?.payment_method) ? 'new_cod' : current;
  return (ORDER_TRANSITIONS[key] || []).includes(next);
}

/** Why a move is impossible, in words an operator can act on. */
export function whyBlocked(order, next) {
  const current = String(order?.status || '');
  const key = current === 'new' && isCod(order?.payment_method) ? 'new_cod' : current;
  const allowed = ORDER_TRANSITIONS[key] || [];
  if (!allowed.length) return 'คำสั่งซื้อนี้จบแล้ว เปลี่ยนสถานะต่อไม่ได้';
  return `จากสถานะนี้เปลี่ยนได้เฉพาะ: ${allowed.join(', ')}`;
}
