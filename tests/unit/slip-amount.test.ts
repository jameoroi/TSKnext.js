import { describe, expect, it } from 'vitest';
import { isSlipAmountMatching, SLIP_AMOUNT_TOLERANCE } from '@/shared/slip-amount.mjs';

describe('slip amount assertion', () => {
  it('accepts exact and rounding-level matches', () => {
    expect(isSlipAmountMatching(5000, 5000)).toBe(true);
    expect(isSlipAmountMatching('5000.00', 5000)).toBe(true);
    expect(isSlipAmountMatching(5000.005, 5000)).toBe(true);
  });

  it('rejects underpayment and non-numeric verifier output', () => {
    expect(isSlipAmountMatching(10, 5000)).toBe(false);
    expect(isSlipAmountMatching(4999.98, 5000)).toBe(false);
    expect(isSlipAmountMatching(undefined, 5000)).toBe(false);
    expect(isSlipAmountMatching(NaN, 5000)).toBe(false);
    expect(isSlipAmountMatching(5000, undefined)).toBe(false);
    expect(SLIP_AMOUNT_TOLERANCE).toBe(0.01);
  });
});
