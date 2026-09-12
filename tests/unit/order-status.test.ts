import { describe, expect, it } from 'vitest';
import { canMoveTo, whyBlocked } from '@/shared/order-status';

describe('order status transitions', () => {
  it('does not let a bank-transfer order jump from new straight to processing', () => {
    expect(canMoveTo({ status: 'new', payment_method: 'โอนเงิน/พร้อมเพย์' }, 'processing')).toBe(false);
    expect(canMoveTo({ status: 'new', payment_method: 'โอนเงิน/พร้อมเพย์' }, 'paid')).toBe(true);
  });

  it('allows COD to start fulfillment before marking payment paid', () => {
    expect(canMoveTo({ status: 'new', payment_method: 'เก็บเงินปลายทาง COD' }, 'processing')).toBe(true);
    expect(canMoveTo({ status: 'new', payment_method: 'เก็บเงินปลายทาง COD' }, 'paid')).toBe(false);
  });

  it('keeps terminal states terminal except completed can refund', () => {
    expect(canMoveTo({ status: 'completed' }, 'refunded')).toBe(true);
    expect(canMoveTo({ status: 'cancelled' }, 'processing')).toBe(false);
    expect(whyBlocked({ status: 'cancelled' })).toMatch(/จบแล้ว/);
  });
});
