import { describe, it, expect } from 'vitest';
import { classifySettlement } from './router';
import type { WorldCard, WorkflowCard, TaskCard } from '../schemas/card';

const emptyWorldCard: WorldCard = {
  goal: null,
  confirmed: { hard_rules: [], soft_rules: [], must_have: [], success_criteria: [] },
  pending: [],
  chief_draft: null,
  budget_draft: null,
  current_proposal: null,
  version: 1,
};

describe('classifySettlement', () => {
  it('WorldCard with hard_rules → village_pack', () => {
    const card: WorldCard = {
      ...emptyWorldCard,
      confirmed: { ...emptyWorldCard.confirmed, hard_rules: ['rule1'] },
    };
    expect(classifySettlement('world', card)).toBe('village_pack');
  });

  it('WorldCard with chief_draft (no hard_rules) → village_pack', () => {
    const card: WorldCard = {
      ...emptyWorldCard,
      chief_draft: { name: 'Bot', role: 'support', style: 'friendly' },
    };
    expect(classifySettlement('world', card)).toBe('village_pack');
  });

  it('empty WorldCard → null', () => {
    expect(classifySettlement('world', emptyWorldCard)).toBeNull();
  });

  it('WorkflowCard with steps → workflow', () => {
    const card: WorkflowCard = {
      name: 'test',
      purpose: null,
      steps: [{ order: 0, description: 'step1', skill: null, conditions: null }],
      confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
      pending: [],
      version: 1,
    };
    expect(classifySettlement('workflow', card)).toBe('workflow');
  });

  it('WorkflowCard with empty steps → null', () => {
    const card: WorkflowCard = {
      name: null,
      purpose: null,
      steps: [],
      confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
      pending: [],
      version: 1,
    };
    expect(classifySettlement('workflow', card)).toBeNull();
  });

  it('TaskCard → task', () => {
    const card: TaskCard = {
      intent: 'test',
      inputs: {},
      constraints: [],
      success_condition: null,
      version: 1,
    };
    expect(classifySettlement('task', card)).toBe('task');
  });
});
