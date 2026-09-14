/**
 * Amount assertion for SlipOK auto-verification.
 *
 * The verifier echoes what IT read on the slip — this asserts it equals what
 * WE charged. Without it, a genuine 10 THB slip pays a 5,000 THB order and the
 * order is marked paid, stock deducted, coupon burned. Fail closed: mismatch
 * means manual review, never an automatic paid state.
 */
export const SLIP_AMOUNT_TOLERANCE = 0.01;

export function isSlipAmountMatching(verifiedAmount, orderTotal, tolerance = SLIP_AMOUNT_TOLERANCE) {
  const got = Number(verifiedAmount);
  const want = Number(orderTotal);
  if (!Number.isFinite(got) || !Number.isFinite(want)) return false;
  return Math.abs(got - want) <= tolerance;
}
