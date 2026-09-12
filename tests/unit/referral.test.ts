import { describe, expect, it } from 'vitest';
import { normalizeAgentRef } from '@/features/agent/referral';

describe('agent referral normalization', () => {
  it('normalizes shopper-entered referral codes consistently', () => {
    expect(normalizeAgentRef('  ab-123  ')).toBe('AB-123');
  });

  it('keeps storage payloads bounded', () => {
    expect(normalizeAgentRef('x'.repeat(200))).toHaveLength(60);
  });
});
