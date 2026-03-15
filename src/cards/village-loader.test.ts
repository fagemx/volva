import { describe, it, expect } from 'vitest';
import { loadVillageState } from './village-loader';
import type { VillageData, ActiveConstitutionData, ChiefData } from '../thyra-client/schemas';

function makeVillage(overrides?: Partial<VillageData>): VillageData {
  return {
    id: 'v-1',
    name: 'Test Village',
    target_repo: 'org/repo',
    ...overrides,
  };
}

function makeConstitution(overrides?: Partial<ActiveConstitutionData>): ActiveConstitutionData {
  return {
    id: 'c-1',
    village_id: 'v-1',
    rules: [
      { description: 'No direct DB access', enforcement: 'hard', scope: ['*'] },
      { description: 'Prefer async', enforcement: 'soft', scope: ['api'] },
    ],
    ...overrides,
  };
}

function makeChief(overrides?: Partial<ChiefData>): ChiefData {
  return {
    id: 'ch-1',
    village_id: 'v-1',
    name: 'Support Chief',
    role: 'support',
    personality: 'friendly and helpful',
    ...overrides,
  };
}

describe('loadVillageState', () => {
  it('maps full village data to a complete WorldCard', () => {
    const village = makeVillage();
    const constitution = makeConstitution({
      budget_limits: {
        max_cost_per_action: 0.5,
        max_cost_per_day: 10,
        max_cost_per_loop: 2,
      },
    });
    const chiefs = [makeChief()];

    const card = loadVillageState(village, constitution, chiefs);

    expect(card.goal).toBe('Modify: Test Village');
    expect(card.target_repo).toBe('org/repo');
    expect(card.confirmed.hard_rules).toHaveLength(1);
    expect(card.confirmed.hard_rules[0].description).toBe('[existing] No direct DB access');
    expect(card.confirmed.hard_rules[0].scope).toEqual(['*']);
    expect(card.confirmed.soft_rules).toHaveLength(1);
    expect(card.confirmed.soft_rules[0].description).toBe('[existing] Prefer async');
    expect(card.confirmed.soft_rules[0].scope).toEqual(['api']);
    expect(card.confirmed.must_have).toEqual([]);
    expect(card.confirmed.success_criteria).toEqual([]);
    expect(card.pending).toEqual([]);
    expect(card.chief_draft).toEqual({
      name: 'Support Chief',
      role: 'support',
      style: 'friendly and helpful',
    });
    expect(card.budget_draft).toEqual({
      per_action: 0.5,
      per_day: 10,
    });
    expect(card.current_proposal).toBeNull();
    expect(card.version).toBe(1);
  });

  it('handles minimal data (no chief, no budget)', () => {
    const village = makeVillage();
    const constitution = makeConstitution({
      rules: [],
      budget_limits: undefined,
    });
    const chiefs: ChiefData[] = [];

    const card = loadVillageState(village, constitution, chiefs);

    expect(card.goal).toBe('Modify: Test Village');
    expect(card.confirmed.hard_rules).toEqual([]);
    expect(card.confirmed.soft_rules).toEqual([]);
    expect(card.chief_draft).toBeNull();
    expect(card.budget_draft).toBeNull();
    expect(card.version).toBe(1);
  });

  it('correctly prefixes rules with [existing]', () => {
    const constitution = makeConstitution({
      rules: [
        { description: 'Rule A', enforcement: 'hard', scope: ['*'] },
        { description: 'Rule B', enforcement: 'hard', scope: ['api'] },
        { description: 'Rule C', enforcement: 'soft', scope: ['*'] },
      ],
    });

    const card = loadVillageState(makeVillage(), constitution, []);

    expect(card.confirmed.hard_rules).toHaveLength(2);
    expect(card.confirmed.hard_rules[0].description).toBe('[existing] Rule A');
    expect(card.confirmed.hard_rules[1].description).toBe('[existing] Rule B');
    expect(card.confirmed.soft_rules).toHaveLength(1);
    expect(card.confirmed.soft_rules[0].description).toBe('[existing] Rule C');
  });

  it('maps chief without optional fields', () => {
    const chiefs = [makeChief({ role: undefined, personality: undefined })];

    const card = loadVillageState(makeVillage(), makeConstitution({ rules: [] }), chiefs);

    expect(card.chief_draft).toEqual({
      name: 'Support Chief',
      role: null,
      style: null,
    });
  });
});
