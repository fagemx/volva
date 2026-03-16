import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { buildVillagePack } from './village-pack-builder';
import type { WorldCard } from '../schemas/card';

const baseCard: WorldCard = {
  goal: 'My Village',
  target_repo: 'github.com/test/repo',
  confirmed: {
    hard_rules: [{ description: 'No refunds', scope: ['billing'] }],
    soft_rules: [{ description: 'Be polite', scope: ['*'] }],
    must_have: ['Product FAQ', 'Inventory Check'],
    success_criteria: [],
    evaluator_rules: [],
  },
  pending: [],
  chief_draft: { name: 'Bot', role: 'support', style: 'warm' },
  budget_draft: { per_action: 5, per_day: 200 },
  llm_preset: 'economy',
  current_proposal: null,
  version: 3,
};

describe('buildVillagePack', () => {
  it('produces valid YAML string', () => {
    const result = buildVillagePack(baseCard);
    expect(typeof result).toBe('string');
    expect(() => yaml.load(result)).not.toThrow();
  });

  it('maps goal to village.name', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    expect((result.village as Record<string, unknown>).name).toBe('My Village');
  });

  it('uses fallback name when goal is null', () => {
    const card: WorldCard = { ...baseCard, goal: null };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    expect((result.village as Record<string, unknown>).name).toBe('Untitled Village');
  });

  it('maps target_repo to village.target_repo', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    expect((result.village as Record<string, unknown>).target_repo).toBe('github.com/test/repo');
  });

  it('uses fallback target_repo when null', () => {
    const card: WorldCard = { ...baseCard, target_repo: null };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    expect((result.village as Record<string, unknown>).target_repo).toBe('default');
  });

  it('includes constitution rules from card', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const constitution = result.constitution as Record<string, unknown>;
    const rules = constitution.rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(2);
    expect(rules[0].enforcement).toBe('hard');
    expect(rules[0].description).toBe('No refunds');
    expect(rules[1].enforcement).toBe('soft');
    expect(rules[1].description).toBe('Be polite');
  });

  it('includes scope arrays in rules', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const constitution = result.constitution as Record<string, unknown>;
    const rules = constitution.rules as Array<Record<string, unknown>>;
    expect(rules[0].scope).toEqual(['billing']);
    expect(rules[1].scope).toEqual(['*']);
  });

  it('includes chief section when chief_draft is present', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const chief = result.chief as Record<string, unknown>;
    expect(chief.name).toBe('Bot');
    expect(chief.personality).toBe('warm');
  });

  it('chief permissions are dispatch_task and propose_law', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const chief = result.chief as Record<string, unknown>;
    expect(chief.permissions).toEqual(['dispatch_task', 'propose_law']);
  });

  it('omits chief section when chief_draft is null', () => {
    const card: WorldCard = { ...baseCard, chief_draft: null };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    expect(result.chief).toBeUndefined();
  });

  it('maps must_have to skills array', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const skills = result.skills as Array<Record<string, string>>;
    expect(skills).toHaveLength(2);
    expect(skills[0].description).toBe('Product FAQ');
    expect(skills[1].description).toBe('Inventory Check');
  });

  it('includes budget_limits when budget_draft is present', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const constitution = result.constitution as Record<string, unknown>;
    expect(constitution.budget_limits).toBeDefined();
  });

  it('omits budget_limits when budget_draft is null', () => {
    const card: WorldCard = { ...baseCard, budget_draft: null };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    const constitution = result.constitution as Record<string, unknown>;
    expect(constitution.budget_limits).toBeUndefined();
  });

  it('includes llm section with preset from card', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const llm = result.llm as Record<string, unknown>;
    expect(llm).toBeDefined();
    expect(llm.preset).toBe('economy');
  });

  it('includes llm section with performance preset', () => {
    const card: WorldCard = { ...baseCard, llm_preset: 'performance' };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    const llm = result.llm as Record<string, unknown>;
    expect(llm.preset).toBe('performance');
  });

  it('defaults llm preset to balanced when llm_preset is null', () => {
    const card: WorldCard = { ...baseCard, llm_preset: null };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    const llm = result.llm as Record<string, unknown>;
    expect(llm.preset).toBe('balanced');
  });

  it('includes evaluator_rules in constitution when present', () => {
    const card: WorldCard = {
      ...baseCard,
      confirmed: {
        ...baseCard.confirmed,
        evaluator_rules: [
          {
            name: 'price-cap',
            trigger: 'price_adjustment',
            condition: 'adjustment <= 20%',
            on_fail: { risk: 'high', action: 'reject' },
          },
        ],
      },
    };
    const result = yaml.load(buildVillagePack(card)) as Record<string, unknown>;
    const constitution = result.constitution as Record<string, unknown>;
    const evalRules = constitution.evaluator_rules as Array<Record<string, unknown>>;
    expect(evalRules).toHaveLength(1);
    expect(evalRules[0].name).toBe('price-cap');
    expect(evalRules[0].trigger).toBe('price_adjustment');
    const onFail = evalRules[0].on_fail as Record<string, unknown>;
    expect(onFail.risk).toBe('high');
    expect(onFail.action).toBe('reject');
  });

  it('omits evaluator_rules key when array is empty', () => {
    const result = yaml.load(buildVillagePack(baseCard)) as Record<string, unknown>;
    const constitution = result.constitution as Record<string, unknown>;
    expect(constitution.evaluator_rules).toBeUndefined();
  });
});
