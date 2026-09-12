import { describe, expect, it } from 'vitest';
import { retryAfterMs } from '@/lib/legacy-api.client';

describe('legacy browser retry pacing', () => {
  it('honours Retry-After seconds but caps the wait', () => {
    expect(retryAfterMs('2', 0)).toBe(2000);
    expect(retryAfterMs('999', 0)).toBe(10_000);
  });

  it('accepts an HTTP-date Retry-After and ignores invalid values', () => {
    const now = Date.UTC(2026, 8, 11, 12, 0, 0);
    expect(retryAfterMs(new Date(now + 3000).toUTCString(), now)).toBe(3000);
    expect(retryAfterMs('not-a-date', now)).toBe(0);
  });
});
