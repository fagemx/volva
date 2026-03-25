import { describe, it, expect } from 'vitest';
import { buildCommerceSpec } from './commerce-spec-builder';
import type { CommerceCard } from '../schemas/card';

function makeCommerceCard(overrides?: Partial<CommerceCard>): CommerceCard {
  return {
    offerings: [],
    pricing_rules: [],
    pending: [],
    version: 1,
    ...overrides,
  };
}

describe('buildCommerceSpec', () => {
  it('produces valid JSON string', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'stall_slot', name: 'Basic Stall', description: 'A basic stall', base_price: 100, capacity: 10, duration: '1d' },
      ],
      pricing_rules: [
        { name: 'Weekend Surge', condition: 'day is weekend', adjustment_pct: 20 },
      ],
    });
    const result = buildCommerceSpec(card);
    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('maps all offering fields correctly', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'event_ticket', name: 'VIP Pass', description: 'VIP entry', base_price: 500, capacity: 50, duration: '3h' },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const offerings = parsed.offerings as Array<Record<string, unknown>>;
    expect(offerings).toHaveLength(1);
    expect(offerings[0].type).toBe('event_ticket');
    expect(offerings[0].name).toBe('VIP Pass');
    expect(offerings[0].description).toBe('VIP entry');
    expect(offerings[0].base_price).toBe(500);
    expect(offerings[0].capacity).toBe(50);
    expect(offerings[0].duration).toBe('3h');
  });

  it('maps all pricing rule fields correctly', () => {
    const card = makeCommerceCard({
      pricing_rules: [
        { name: 'Early Bird', condition: 'purchase before event', adjustment_pct: -15 },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const rules = parsed.pricing_rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe('Early Bird');
    expect(rules[0].condition).toBe('purchase before event');
    expect(rules[0].adjustment_pct).toBe(-15);
  });

  it('handles empty card', () => {
    const card = makeCommerceCard();
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    expect(parsed.offerings).toEqual([]);
    expect(parsed.pricing_rules).toEqual([]);
  });

  it('handles multiple offerings and rules', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'stall_slot', name: 'A', description: 'a', base_price: null, capacity: null, duration: null },
        { type: 'membership', name: 'B', description: 'b', base_price: 200, capacity: null, duration: '30d' },
      ],
      pricing_rules: [
        { name: 'R1', condition: 'c1', adjustment_pct: 10 },
        { name: 'R2', condition: 'c2', adjustment_pct: -5 },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    expect((parsed.offerings as unknown[]).length).toBe(2);
    expect((parsed.pricing_rules as unknown[]).length).toBe(2);
  });

  it('preserves null values in offerings', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'commission', name: 'test', description: 'desc', base_price: null, capacity: null, duration: null },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const offerings = parsed.offerings as Array<Record<string, unknown>>;
    expect(offerings[0].base_price).toBeNull();
    expect(offerings[0].capacity).toBeNull();
    expect(offerings[0].duration).toBeNull();
  });

  it('preserves zero base_price and zero capacity', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'stall_slot', name: 'Free Stall', description: 'free', base_price: 0, capacity: 0, duration: null },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const offerings = parsed.offerings as Array<Record<string, unknown>>;
    expect(offerings[0].base_price).toBe(0);
    expect(offerings[0].capacity).toBe(0);
  });

  it('preserves zero adjustment_pct', () => {
    const card = makeCommerceCard({
      pricing_rules: [
        { name: 'No Change', condition: 'always', adjustment_pct: 0 },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const rules = parsed.pricing_rules as Array<Record<string, unknown>>;
    expect(rules[0].adjustment_pct).toBe(0);
  });

  it('handles empty strings in offering fields', () => {
    const card = makeCommerceCard({
      offerings: [
        { type: 'membership', name: '', description: '', base_price: 100, capacity: null, duration: '' },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const offerings = parsed.offerings as Array<Record<string, unknown>>;
    expect(offerings[0].name).toBe('');
    expect(offerings[0].description).toBe('');
    expect(offerings[0].duration).toBe('');
  });

  it('handles empty string in pricing rule condition', () => {
    const card = makeCommerceCard({
      pricing_rules: [
        { name: '', condition: '', adjustment_pct: 10 },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const rules = parsed.pricing_rules as Array<Record<string, unknown>>;
    expect(rules[0].name).toBe('');
    expect(rules[0].condition).toBe('');
  });

  it('handles large negative adjustment_pct', () => {
    const card = makeCommerceCard({
      pricing_rules: [
        { name: 'Massive Discount', condition: 'fire sale', adjustment_pct: -99 },
      ],
    });
    const parsed = JSON.parse(buildCommerceSpec(card)) as Record<string, unknown>;
    const rules = parsed.pricing_rules as Array<Record<string, unknown>>;
    expect(rules[0].adjustment_pct).toBe(-99);
  });
});
