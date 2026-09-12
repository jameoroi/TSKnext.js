/**
 * The one shipping rule.
 *
 * Delivery is a flat fee up to a free-shipping threshold. `order.create` in
 * api/api.js is authoritative — it recalculates the fee, the
 * coupon and the total from the database on every order, and saves that. The
 * cart and the checkout mirror it here so the shopper is quoted the amount they
 * will actually be charged.
 *
 * These constants used to be typed separately into cart.vue (which charged the
 * fee) and checkout.vue (which did not), so an order under the threshold showed
 * a total that dropped by the fee on the way to the payment step, and the
 * PromptPay QR encoded that short amount. scripts/r85-checkout-totals.test.mjs
 * compares this module against the server formula across every coupon type;
 * changing one side alone fails that test.
 *
 * Plain `.mjs` with JSDoc types rather than `.ts` so the test can import it
 * under `node` without a type-stripping flag.
 */

export const FREE_SHIPPING_FROM = 1500;
export const FLAT_SHIPPING = 80;

/**
 * @typedef {object} CouponDiscounts
 * @property {number} [productDiscount] `discount` from coupon.validate — taken off the goods.
 * @property {number} [shippingDiscount] `shipping_discount` from coupon.validate — taken off the delivery fee.
 */

/**
 * @typedef {object} OrderTotals
 * @property {number} subtotal
 * @property {number} baseShipping Delivery fee before any coupon.
 * @property {number} shippingDiscount The part of the fee a coupon covered, never more than the fee.
 * @property {number} payableShipping Delivery fee the shopper actually pays.
 * @property {number} discount Discount on the goods, never more than the goods are worth.
 * @property {number} total Amount due.
 * @property {number} remainingForFreeShipping How much more is needed for free delivery; 0 once reached.
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * @param {unknown} subtotal
 * @returns {number}
 */
export function shippingFor(subtotal) {
  return money(subtotal) > FREE_SHIPPING_FROM ? 0 : FLAT_SHIPPING;
}

/**
 * Mirrors the server calculation: the coupon's shipping half can only eat the
 * delivery fee, its product half can only eat the goods, and neither can push
 * the total below zero.
 *
 * @param {unknown} subtotalInput
 * @param {CouponDiscounts} [coupon]
 * @returns {OrderTotals}
 */
export function orderTotals(subtotalInput, coupon = {}) {
  const subtotal = money(subtotalInput);
  const baseShipping = shippingFor(subtotal);
  const shippingDiscount = Math.min(baseShipping, money(coupon.shippingDiscount));
  const payableShipping = Math.max(0, baseShipping - shippingDiscount);
  const discount = Math.min(subtotal, money(coupon.productDiscount));
  return {
    subtotal,
    baseShipping,
    shippingDiscount,
    payableShipping,
    discount,
    total: Math.max(0, subtotal + payableShipping - discount),
    remainingForFreeShipping: Math.max(0, FREE_SHIPPING_FROM - subtotal),
  };
}
