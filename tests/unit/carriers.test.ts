import { describe, expect, it } from 'vitest';
import { carrierName, findCarrier, needsPaste, trackingUrl } from '@/shared/carriers';

describe('carrier normalization', () => {
  it('normalizes older free-text values', () => {
    expect(findCarrier('Flash Express')?.id).toBe('flash');
    expect(carrierName('ไปรษณีย์ไทย')).toBe('ไปรษณีย์ไทย');
  });

  it('deep-links Thailand Post and keeps paste flow for others', () => {
    expect(trackingUrl('thaipost', 'AB123456789TH')).toContain('AB123456789TH');
    expect(needsPaste('flash')).toBe(true);
    expect(needsPaste('thaipost')).toBe(false);
  });
});
