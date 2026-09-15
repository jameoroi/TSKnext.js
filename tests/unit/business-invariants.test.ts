import { afterEach, describe, expect, it } from 'vitest';
import { resolveTenant, tenantNamespaces } from '@/legacy-api/lib/tenants.js';
import { aggregateReservationLines } from '@/server/db/stock';
import { agentLevelStanding, effectiveCommissionRate } from '@/shared/agent-levels.mjs';

const previousTenants = process.env.TOGROW_TENANTS;
const previousPreviewTenant = process.env.TOGROW_PREVIEW_TENANT;

afterEach(() => {
  if (previousTenants === undefined) delete process.env.TOGROW_TENANTS;
  else process.env.TOGROW_TENANTS = previousTenants;
  if (previousPreviewTenant === undefined) delete process.env.TOGROW_PREVIEW_TENANT;
  else process.env.TOGROW_PREVIEW_TENANT = previousPreviewTenant;
});

describe('business invariants', () => {
  it('calculates the commission rate from the earned level and respects an explicit override', () => {
    expect(agentLevelStanding(10_000).commission_rate).toBe(1);
    expect(effectiveCommissionRate({ lifetime_sales: 10_000 })).toBe(1);
    expect(effectiveCommissionRate({ lifetime_sales: 10_000, commission_rate_override: 3.25 })).toBe(3.25);
  });

  it('collapses duplicate stock lines before a reservation transaction checks availability', () => {
    expect(
      aggregateReservationLines([
        { productId: 'p2', quantity: 1 },
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 3 },
      ]),
    ).toEqual({
      ok: true,
      lines: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 4 },
      ],
    });
    expect(aggregateReservationLines([{ productId: 'p1', quantity: 0 }])).toMatchObject({
      ok: false,
      error: 'invalid_quantity',
    });
  });

  it('does not resolve an unknown host to another tenant', () => {
    process.env.TOGROW_TENANTS = JSON.stringify([
      { id: 'tsk', name: 'TSK', hosts: ['jayxtsk.shop'] },
      { id: 'other', name: 'Other', hosts: ['other.example'] },
    ]);
    delete process.env.TOGROW_PREVIEW_TENANT;
    expect(resolveTenant('unknown.example')).toBeNull();
    expect(resolveTenant('jayxtsk.shop')?.id).toBe('tsk');
    expect(tenantNamespaces({ id: 'tsk' })).not.toEqual(tenantNamespaces({ id: 'other' }));
  });
});
