import { afterEach, describe, expect, it } from 'vitest';
import { signKitQuote, verifyKitQuote } from '@/shared/kit-quote.mjs';

const previous = process.env.KIT_QUOTE_SECRET;
afterEach(() => {
  if (previous === undefined) delete process.env.KIT_QUOTE_SECRET;
  else process.env.KIT_QUOTE_SECRET = previous;
});

describe('signed equipment-kit quote', () => {
  it('accepts a valid same-tenant cart claim', () => {
    process.env.KIT_QUOTE_SECRET = 'unit-test-kit-quote-secret';
    const token = signKitQuote({
      tenant: 'tsk', set_id: 'kit-1', set_name: 'ชุดช่างไฟ', discount_amount: 250, eligible_subtotal: 2500,
      items: [{ id: 'p1', variant_id: '', qty: 1 }, { id: 'p2', variant_id: 'v2', qty: 2 }],
    });
    const result = verifyKitQuote(token, { tenantId: 'tsk', items: [{ id: 'p1', qty: 1 }, { id: 'p2', variant_id: 'v2', qty: 2 }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.discount_amount).toBe(250);
  });

  it('rejects changed carts and cross-tenant reuse', () => {
    process.env.KIT_QUOTE_SECRET = 'unit-test-kit-quote-secret';
    const token = signKitQuote({ tenant: 'tsk', set_id: 'kit-1', discount_amount: 100, eligible_subtotal: 1000, items: [{ id: 'p1', qty: 2 }] });
    expect(verifyKitQuote(token, { tenantId: 'tsk', items: [{ id: 'p1', qty: 1 }] })).toMatchObject({ ok: false, error: 'kit_quote_cart_changed' });
    expect(verifyKitQuote(token, { tenantId: 'other', items: [{ id: 'p1', qty: 2 }] })).toMatchObject({ ok: false, error: 'kit_quote_tenant' });
  });
});
