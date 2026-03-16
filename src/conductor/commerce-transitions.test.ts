import { describe, it, expect } from 'vitest';
import { checkTransition } from './state-machine';
import type { CommerceCard } from '../schemas/card';

function makeCommerceCard(opts?: {
  offeringsCount?: number;
  pricingRulesCount?: number;
  pendingCount?: number;
}): CommerceCard {
  return {
    offerings: Array.from({ length: opts?.offeringsCount ?? 0 }, (_, i) => ({
      type: 'stall_slot' as const,
      name: `offering-${i}`,
      description: `desc-${i}`,
      base_price: null,
      capacity: null,
      duration: null,
    })),
    pricing_rules: Array.from({ length: opts?.pricingRulesCount ?? 0 }, (_, i) => ({
      name: `rule-${i}`,
      condition: `condition-${i}`,
      adjustment_pct: 0,
    })),
    pending: Array.from({ length: opts?.pendingCount ?? 0 }, (_, i) => ({
      question: `q${i}`,
      context: `c${i}`,
    })),
    version: 1,
  };
}

describe('CommerceCard: EXPLORE transitions', () => {
  it('explore stays when no offerings', () => {
    const card = makeCommerceCard({ pricingRulesCount: 1 });
    const result = checkTransition('explore', 'commerce', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays when no pricing rules', () => {
    const card = makeCommerceCard({ offeringsCount: 1 });
    const result = checkTransition('explore', 'commerce', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore -> focus when offerings >= 1 and pricing_rules >= 1', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('explore', 'commerce', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBe('offerings >= 1 + pricing_rules >= 1');
  });
});

describe('CommerceCard: FOCUS -> SETTLE transitions', () => {
  it('focus -> settle on confirm with empty pending', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('focus', 'commerce', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('pending empty + user confirmed');
  });

  it('focus stays on confirm with non-empty pending', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1, pendingCount: 1 });
    const result = checkTransition('focus', 'commerce', card, 'confirm');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });

  it('focus -> settle on settle_signal', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('focus', 'commerce', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('user explicit settle signal');
  });

  it('focus -> settle on consecutive nomod turns >= 2', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('focus', 'commerce', card, 'add_info', 2);
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('consecutive 2 turns with no modification');
  });
});

describe('CommerceCard: SETTLE -> EXPLORE transitions', () => {
  it('settle -> explore on new_intent', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('settle', 'commerce', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('new topic after settlement');
  });

  it('settle stays on confirm', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('settle', 'commerce', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBeNull();
  });
});

describe('CommerceCard: FOCUS -> EXPLORE rollback', () => {
  it('focus -> explore on new_intent', () => {
    const card = makeCommerceCard({ offeringsCount: 1, pricingRulesCount: 1 });
    const result = checkTransition('focus', 'commerce', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('major direction change');
  });
});
