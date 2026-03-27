import { describe, it, expect } from 'vitest';
import { applyIntentToCommerceCard } from './card-mutations';
import { createEmptyCommerceCard } from './card-factories';
import type { CommerceCard } from '../schemas/card';
import type { Intent } from '../schemas/intent';

function makeCommerceCard(overrides?: Partial<CommerceCard>): CommerceCard {
  return {
    ...createEmptyCommerceCard(),
    ...overrides,
  };
}

function makeIntent(opts: { type: Intent['type']; summary: string } & Omit<Partial<Intent>, 'type' | 'summary'>): Intent {
  return {
    ...opts,
  };
}

describe('applyIntentToCommerceCard', () => {
  it('new_intent adds offering with stall_slot type', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({ type: 'new_intent', summary: 'Weekend Market Stall' });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.offerings).toHaveLength(1);
    expect(result.offerings[0].type).toBe('stall_slot');
    expect(result.offerings[0].name).toBe('Weekend Market Stall');
  });

  it('add_info adds offerings from entities', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({
      type: 'add_info',
      summary: 'add stuff',
      entities: { 'Premium Stall': 'Large stall near entrance' },
    });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.offerings).toHaveLength(1);
    expect(result.offerings[0].name).toBe('Premium Stall');
    expect(result.offerings[0].description).toBe('Large stall near entrance');
  });

  it('add_info uses offering_type from entities if valid', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({
      type: 'add_info',
      summary: 'membership plan',
      entities: { 'Gold Member': 'Monthly membership', offering_type: 'membership' },
    });
    const result = applyIntentToCommerceCard(card, intent);
    // The offering_type entity itself also gets added as an offering,
    // but the ones derived from other entities use the resolved type
    const memberOffering = result.offerings.find(o => o.name === 'Gold Member');
    expect(memberOffering).toBeDefined();
    expect(memberOffering!.type).toBe('membership');
  });

  it('set_boundary (hard) adds pricing rule', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({
      type: 'set_boundary',
      summary: 'Price cannot exceed 1000',
      enforcement: 'hard',
    });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.pricing_rules).toHaveLength(1);
    expect(result.pricing_rules[0].name).toBe('Price cannot exceed 1000');
  });

  it('set_boundary (soft) adds pricing rule', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({
      type: 'set_boundary',
      summary: 'Prefer prices under 500',
      enforcement: 'soft',
    });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.pricing_rules).toHaveLength(1);
    expect(result.pricing_rules[0].name).toBe('Prefer prices under 500');
  });

  it('add_constraint adds pricing rule', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({ type: 'add_constraint', summary: 'Discount for bulk orders' });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.pricing_rules).toHaveLength(1);
    expect(result.pricing_rules[0].condition).toBe('Discount for bulk orders');
  });

  it('modify updates offering description by target_name', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'stall_slot', name: 'Basic Stall', description: 'old desc', base_price: null, capacity: null, duration: null },
      ],
    });
    const intent = makeIntent({
      type: 'modify',
      summary: 'Updated stall description',
      entities: { target_name: 'Basic Stall' },
    });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.offerings[0].description).toBe('Updated stall description');
  });

  it('modify updates pricing rule condition by target_name', () => {
    const card = makeCommerceCard({
      pricing_rules: [
        { name: 'Weekend Rule', condition: 'old condition', adjustment_pct: 10 },
      ],
    });
    const intent = makeIntent({
      type: 'modify',
      summary: 'New weekend condition',
      entities: { target_name: 'Weekend Rule' },
    });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.pricing_rules[0].condition).toBe('New weekend condition');
  });

  it('confirm is a no-op', () => {
    const card = makeCommerceCard({
      offerings: [{ type: 'stall_slot', name: 'A', description: 'B', base_price: null, capacity: null, duration: null }],
    });
    const intent = makeIntent({ type: 'confirm', summary: 'ok' });
    const result = applyIntentToCommerceCard(card, intent);
    expect(result.offerings).toHaveLength(1);
    expect(result.pricing_rules).toHaveLength(0);
  });

  it('does not mutate original card', () => {
    const card = makeCommerceCard();
    const intent = makeIntent({ type: 'new_intent', summary: 'test' });
    const result = applyIntentToCommerceCard(card, intent);
    expect(card.offerings).toHaveLength(0);
    expect(result.offerings).toHaveLength(1);
  });
});
