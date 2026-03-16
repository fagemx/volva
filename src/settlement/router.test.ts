import { describe, it, expect } from 'vitest';
import { classifySettlement } from './router';
import type { WorldCard, WorkflowCard, TaskCard, PipelineCard } from '../schemas/card';

const emptyWorldCard: WorldCard = {
  goal: null,
  target_repo: null,
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
      confirmed: { ...emptyWorldCard.confirmed, hard_rules: [{ description: 'rule1', scope: ['*'] }] },
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

  it('PipelineCard with steps → pipeline', () => {
    const card: PipelineCard = {
      name: 'test',
      steps: [{
        order: 0,
        type: 'skill',
        label: 'step1',
        skill_name: 'skill1',
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: null,
        on_true: null,
        on_false: null,
      }],
      schedule: null,
      proposed_skills: [],
      pending: [],
      version: 1,
    };
    expect(classifySettlement('pipeline', card)).toBe('pipeline');
  });

  it('PipelineCard with empty steps → null', () => {
    const card: PipelineCard = {
      name: null,
      steps: [],
      schedule: null,
      proposed_skills: [],
      pending: [],
      version: 1,
    };
    expect(classifySettlement('pipeline', card)).toBeNull();
  });
});
