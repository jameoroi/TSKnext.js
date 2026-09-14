import { describe, expect, it } from 'vitest';
import { summarizeOrderRows } from '@/legacy-api/lib/relational-orders.js';

describe('relational order report projection', () => {
  it('preserves paid revenue, units, cost and refunded totals', () => {
    const rows = [
      {
        id: 'o1',
        status: 'completed',
        total: 2500,
        shipping: 80,
        discount: 100,
        created_at: '2026-09-10T10:00:00.000Z',
        channel: 'website',
        items: [
          { id: 'p1', name: 'Drill', qty: 2, price: 1000, cost_price: 700 },
          { id: 'p2', name: 'Bit', qty: 1, price: 500, cost_price: 200 },
        ],
      },
      { id: 'o2', status: 'refunded', total: 300, created_at: '2026-09-10T11:00:00.000Z', items: [] },
    ];
    const report = summarizeOrderRows(rows, '2026-09-10', '2026-09-10');
    expect(report.summary.orders).toBe(2);
    expect(report.summary.paid_orders).toBe(1);
    expect(report.summary.revenue).toBe(2500);
    expect(report.summary.refunds).toBe(300);
    expect(report.summary.units).toBe(3);
    expect(report.summary.cost).toBe(1600);
    expect(report.top_products[0]?.product_id).toBe('p1');
  });

  it('filters by channel and date', () => {
    const rows = [
      {
        id: 'a',
        status: 'paid',
        total: 100,
        created_at: '2026-09-01T00:00:00.000Z',
        channel: 'website',
        items: [],
      },
      {
        id: 'b',
        status: 'paid',
        total: 200,
        created_at: '2026-09-02T00:00:00.000Z',
        channel: 'shopee',
        items: [],
      },
    ];
    const report = summarizeOrderRows(rows, '2026-09-02', '2026-09-02', 'shopee');
    expect(report.summary.orders).toBe(1);
    expect(report.summary.revenue).toBe(200);
  });
});
