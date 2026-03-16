import type { CommerceCard } from '../schemas/card';

interface MarketInitSpec {
  offerings: Array<{
    type: string;
    name: string;
    description: string;
    base_price: number | null;
    capacity: number | null;
    duration: string | null;
  }>;
  pricing_rules: Array<{
    name: string;
    condition: string;
    adjustment_pct: number;
  }>;
}

export function buildCommerceSpec(card: CommerceCard): string {
  const spec: MarketInitSpec = {
    offerings: card.offerings.map((o) => ({
      type: o.type,
      name: o.name,
      description: o.description,
      base_price: o.base_price,
      capacity: o.capacity,
      duration: o.duration,
    })),
    pricing_rules: card.pricing_rules.map((r) => ({
      name: r.name,
      condition: r.condition,
      adjustment_pct: r.adjustment_pct,
    })),
  };

  return JSON.stringify(spec, null, 2);
}
