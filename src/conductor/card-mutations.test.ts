import { describe, it, expect } from 'vitest';
import type { Intent } from '../schemas/intent';
import type {
  WorldCard,
  WorkflowCard,
  TaskCard,
  PipelineCard,
  AdapterCard,
  CommerceCard,
  OrgCard,
} from '../schemas/card';
import {
  applyIntentToCard,
  applyIntentToWorkflowCard,
  applyIntentToTaskCard,
  applyIntentToPipelineCard,
  applyIntentToAdapterCard,
  applyIntentToCommerceCard,
  applyIntentToOrgCard,
  applyIntent,
} from './card-mutations';

// ─── Fixtures ───

function makeWorldCard(overrides?: Partial<WorldCard>): WorldCard {
  return {
    goal: null,
    target_repo: null,
    confirmed: {
      hard_rules: [],
      soft_rules: [],
      must_have: [],
      success_criteria: [],
      evaluator_rules: [],
    },
    pending: [],
    chief_draft: null,
    budget_draft: null,
    llm_preset: null,
    current_proposal: null,
    version: 1,
    ...overrides,
  };
}

function makeWorkflowCard(overrides?: Partial<WorkflowCard>): WorkflowCard {
  return {
    name: null,
    purpose: null,
    steps: [],
    confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
    pending: [],
    version: 1,
    ...overrides,
  };
}

function makeTaskCard(overrides?: Partial<TaskCard>): TaskCard {
  return {
    intent: '',
    inputs: {},
    constraints: [],
    success_condition: null,
    version: 1,
    ...overrides,
  };
}

function makePipelineCard(overrides?: Partial<PipelineCard>): PipelineCard {
  return {
    name: null,
    steps: [],
    schedule: null,
    proposed_skills: [],
    pending: [],
    version: 1,
    ...overrides,
  };
}

function makeAdapterCard(overrides?: Partial<AdapterCard>): AdapterCard {
  return {
    platforms: [],
    version: 1,
    ...overrides,
  };
}

function makeCommerceCard(overrides?: Partial<CommerceCard>): CommerceCard {
  return {
    offerings: [],
    pricing_rules: [],
    pending: [],
    version: 1,
    ...overrides,
  };
}

function makeOrgCard(overrides?: Partial<OrgCard>): OrgCard {
  return {
    director: null,
    departments: [],
    governance: { cycle: null, chief_order: [], escalation: null },
    pending: [],
    version: 1,
    ...overrides,
  };
}

function makeIntent(overrides: Partial<Intent> & { type: Intent['type']; summary: string }): Intent {
  return { ...overrides };
}

// ─── Immutability ───

describe('immutability', () => {
  it('applyIntentToCard returns a new object without mutating the original', () => {
    const card = makeWorldCard({ goal: 'original' });
    const result = applyIntentToCard(card, makeIntent({ type: 'new_intent', summary: 'changed' }));
    expect(result.goal).toBe('changed');
    expect(card.goal).toBe('original');
    expect(result).not.toBe(card);
  });

  it('applyIntentToWorkflowCard does not mutate input', () => {
    const card = makeWorkflowCard();
    const result = applyIntentToWorkflowCard(card, makeIntent({ type: 'new_intent', summary: 'wf' }));
    expect(result.name).toBe('wf');
    expect(card.name).toBeNull();
  });

  it('applyIntentToTaskCard does not mutate input', () => {
    const card = makeTaskCard();
    const result = applyIntentToTaskCard(card, makeIntent({ type: 'new_intent', summary: 'task goal' }));
    expect(result.intent).toBe('task goal');
    expect(card.intent).toBe('');
  });

  it('applyIntentToPipelineCard does not mutate input', () => {
    const card = makePipelineCard();
    const result = applyIntentToPipelineCard(card, makeIntent({ type: 'new_intent', summary: 'pipe' }));
    expect(result.name).toBe('pipe');
    expect(card.name).toBeNull();
  });

  it('applyIntentToAdapterCard does not mutate input', () => {
    const card = makeAdapterCard();
    const result = applyIntentToAdapterCard(card, makeIntent({ type: 'new_intent', summary: 'discord telegram' }));
    expect(result.platforms.length).toBeGreaterThan(0);
    expect(card.platforms).toHaveLength(0);
  });

  it('applyIntentToCommerceCard does not mutate input', () => {
    const card = makeCommerceCard();
    const result = applyIntentToCommerceCard(card, makeIntent({ type: 'new_intent', summary: 'offering' }));
    expect(result.offerings).toHaveLength(1);
    expect(card.offerings).toHaveLength(0);
  });

  it('applyIntentToOrgCard does not mutate input', () => {
    const card = makeOrgCard();
    const result = applyIntentToOrgCard(card, makeIntent({ type: 'new_intent', summary: 'director' }));
    expect(result.director).not.toBeNull();
    expect(card.director).toBeNull();
  });
});

// ─── WorldCard ───

describe('applyIntentToCard (WorldCard)', () => {
  it('new_intent sets goal', () => {
    const result = applyIntentToCard(makeWorldCard(), makeIntent({ type: 'new_intent', summary: 'build an app' }));
    expect(result.goal).toBe('build an app');
  });

  it('add_info pushes to must_have', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { feature: 'auth' } }),
    );
    expect(result.confirmed.must_have).toContain('auth');
  });

  it('add_info with llm_preset sets llm_preset', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { llm_preset: 'performance' } }),
    );
    expect(result.llm_preset).toBe('performance');
  });

  it('add_info deduplicates must_have entries', () => {
    const card = makeWorldCard();
    card.confirmed.must_have = ['auth'];
    const result = applyIntentToCard(
      card,
      makeIntent({ type: 'add_info', summary: '', entities: { feature: 'auth' } }),
    );
    expect(result.confirmed.must_have.filter((v) => v === 'auth')).toHaveLength(1);
  });

  it('set_boundary with hard enforcement adds hard_rule', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({ type: 'set_boundary', summary: 'no external deps', enforcement: 'hard' }),
    );
    expect(result.confirmed.hard_rules).toHaveLength(1);
    expect(result.confirmed.hard_rules[0].description).toBe('no external deps');
  });

  it('set_boundary with soft enforcement adds soft_rule', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({ type: 'set_boundary', summary: 'prefer simple', enforcement: 'soft' }),
    );
    expect(result.confirmed.soft_rules).toHaveLength(1);
    expect(result.confirmed.soft_rules[0].description).toBe('prefer simple');
  });

  it('add_constraint adds soft_rule', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({ type: 'add_constraint', summary: 'max 100ms' }),
    );
    expect(result.confirmed.soft_rules).toHaveLength(1);
  });

  it('add_evaluator_rule pushes evaluator rule', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({
        type: 'add_evaluator_rule',
        summary: 'check cost',
        entities: { name: 'cost_check', trigger: 'on_complete', condition: 'cost < 10', risk: 'high', action: 'reject' },
      }),
    );
    expect(result.confirmed.evaluator_rules).toHaveLength(1);
    expect(result.confirmed.evaluator_rules[0].name).toBe('cost_check');
    expect(result.confirmed.evaluator_rules[0].on_fail.risk).toBe('high');
    expect(result.confirmed.evaluator_rules[0].on_fail.action).toBe('reject');
  });

  it('add_evaluator_rule defaults risk to medium and action to warn', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({
        type: 'add_evaluator_rule',
        summary: 'check',
        entities: { risk: 'unknown', action: 'unknown' },
      }),
    );
    expect(result.confirmed.evaluator_rules[0].on_fail.risk).toBe('medium');
    expect(result.confirmed.evaluator_rules[0].on_fail.action).toBe('warn');
  });

  it('style_preference sets chief_draft.style', () => {
    const result = applyIntentToCard(
      makeWorldCard(),
      makeIntent({ type: 'style_preference', summary: 'concise' }),
    );
    expect(result.chief_draft).not.toBeNull();
    expect(result.chief_draft!.style).toBe('concise');
  });

  it('modify updates matching hard_rule', () => {
    const card = makeWorldCard();
    card.confirmed.hard_rules = [{ description: 'rule-alpha', scope: ['*'] }];
    const result = applyIntentToCard(
      card,
      makeIntent({ type: 'modify', summary: 'updated rule', entities: { target_rule: 'rule-alpha' } }),
    );
    expect(result.confirmed.hard_rules[0].description).toBe('[changed] updated rule');
  });

  it('modify updates matching soft_rule', () => {
    const card = makeWorldCard();
    card.confirmed.soft_rules = [{ description: 'rule-beta', scope: ['*'] }];
    const result = applyIntentToCard(
      card,
      makeIntent({ type: 'modify', summary: 'updated', entities: { target_rule: 'rule-beta' } }),
    );
    expect(result.confirmed.soft_rules[0].description).toBe('[changed] updated');
  });

  it('modify updates matching evaluator_rule name', () => {
    const card = makeWorldCard();
    card.confirmed.evaluator_rules = [
      { name: 'eval-gamma', trigger: 't', condition: 'c', on_fail: { risk: 'low', action: 'warn' } },
    ];
    const result = applyIntentToCard(
      card,
      makeIntent({ type: 'modify', summary: 'new eval', entities: { target_rule: 'eval-gamma' } }),
    );
    expect(result.confirmed.evaluator_rules[0].name).toBe('[changed] new eval');
  });

  it('modify adds new soft_rule when no match found', () => {
    const card = makeWorldCard();
    const result = applyIntentToCard(
      card,
      makeIntent({ type: 'modify', summary: 'fallback rule', entities: { target_rule: 'nonexistent' } }),
    );
    expect(result.confirmed.soft_rules).toHaveLength(1);
    expect(result.confirmed.soft_rules[0].description).toBe('[new] fallback rule');
  });

  it.each(['confirm', 'settle_signal', 'question', 'off_topic', 'query_status', 'query_history'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makeWorldCard({ goal: 'keep' });
      const result = applyIntentToCard(card, makeIntent({ type, summary: 'ignored' }));
      expect(result.goal).toBe('keep');
      expect(result).toEqual(card);
    },
  );
});

// ─── WorkflowCard ───

describe('applyIntentToWorkflowCard', () => {
  it('new_intent sets name and purpose', () => {
    const result = applyIntentToWorkflowCard(
      makeWorkflowCard(),
      makeIntent({ type: 'new_intent', summary: 'deploy flow' }),
    );
    expect(result.name).toBe('deploy flow');
    expect(result.purpose).toBe('deploy flow');
  });

  it('add_info adds steps from entities', () => {
    const result = applyIntentToWorkflowCard(
      makeWorkflowCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { step1: 'build', step2: 'test' } }),
    );
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].order).toBe(0);
    expect(result.steps[0].description).toBe('build');
    expect(result.steps[1].order).toBe(1);
  });

  it('set_boundary hard adds to triggers', () => {
    const result = applyIntentToWorkflowCard(
      makeWorkflowCard(),
      makeIntent({ type: 'set_boundary', summary: 'on push', enforcement: 'hard' }),
    );
    expect(result.confirmed.triggers).toContain('on push');
  });

  it('set_boundary soft adds to exit_conditions', () => {
    const result = applyIntentToWorkflowCard(
      makeWorkflowCard(),
      makeIntent({ type: 'set_boundary', summary: 'all tests pass', enforcement: 'soft' }),
    );
    expect(result.confirmed.exit_conditions).toContain('all tests pass');
  });

  it('add_constraint adds to failure_handling', () => {
    const result = applyIntentToWorkflowCard(
      makeWorkflowCard(),
      makeIntent({ type: 'add_constraint', summary: 'retry 3 times' }),
    );
    expect(result.confirmed.failure_handling).toContain('retry 3 times');
  });

  it.each(['add_evaluator_rule', 'confirm', 'settle_signal', 'modify', 'question', 'off_topic', 'style_preference'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makeWorkflowCard({ name: 'keep' });
      const result = applyIntentToWorkflowCard(card, makeIntent({ type, summary: 'x' }));
      expect(result).toEqual(card);
    },
  );
});

// ─── TaskCard ───

describe('applyIntentToTaskCard', () => {
  it('new_intent sets intent', () => {
    const result = applyIntentToTaskCard(
      makeTaskCard(),
      makeIntent({ type: 'new_intent', summary: 'parse CSV' }),
    );
    expect(result.intent).toBe('parse CSV');
  });

  it('add_info populates inputs', () => {
    const result = applyIntentToTaskCard(
      makeTaskCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { file: 'data.csv', delimiter: ',' } }),
    );
    expect(result.inputs.file).toBe('data.csv');
    expect(result.inputs.delimiter).toBe(',');
  });

  it('set_boundary and add_constraint add to constraints', () => {
    let result = applyIntentToTaskCard(
      makeTaskCard(),
      makeIntent({ type: 'set_boundary', summary: 'max 1MB' }),
    );
    expect(result.constraints).toContain('max 1MB');

    result = applyIntentToTaskCard(
      makeTaskCard(),
      makeIntent({ type: 'add_constraint', summary: 'UTF-8 only' }),
    );
    expect(result.constraints).toContain('UTF-8 only');
  });

  it.each(['add_evaluator_rule', 'confirm', 'settle_signal', 'modify', 'question', 'off_topic', 'style_preference'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makeTaskCard({ intent: 'keep' });
      const result = applyIntentToTaskCard(card, makeIntent({ type, summary: 'x' }));
      expect(result).toEqual(card);
    },
  );
});

// ─── PipelineCard ───

describe('applyIntentToPipelineCard', () => {
  it('new_intent sets name', () => {
    const result = applyIntentToPipelineCard(
      makePipelineCard(),
      makeIntent({ type: 'new_intent', summary: 'CI pipeline' }),
    );
    expect(result.name).toBe('CI pipeline');
  });

  it('add_info adds skill steps and auto-populates proposed_skills', () => {
    const result = applyIntentToPipelineCard(
      makePipelineCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { s1: 'lint', s2: 'test' } }),
    );
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].type).toBe('skill');
    expect(result.steps[0].skill_name).toBe('lint');
    expect(result.proposed_skills.length).toBeGreaterThanOrEqual(2);
  });

  it('set_boundary hard adds gate step', () => {
    const result = applyIntentToPipelineCard(
      makePipelineCard(),
      makeIntent({ type: 'set_boundary', summary: 'approval gate', enforcement: 'hard' }),
    );
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('gate');
    expect(result.steps[0].condition).toBe('approval gate');
  });

  it('set_boundary soft with target_step sets revision_target', () => {
    const card = makePipelineCard();
    card.steps = [
      { order: 0, type: 'skill', label: 'build-step', skill_name: null, instruction: null, revision_target: null, max_revision_cycles: null, condition: null, on_true: null, on_false: null },
    ];
    const result = applyIntentToPipelineCard(
      card,
      makeIntent({ type: 'set_boundary', summary: 'review needed', enforcement: 'soft', entities: { target_step: 'build-step' } }),
    );
    expect(result.steps[0].revision_target).toBe('review needed');
    expect(result.steps[0].max_revision_cycles).toBe(3);
  });

  it('add_constraint adds branch step', () => {
    const result = applyIntentToPipelineCard(
      makePipelineCard(),
      makeIntent({ type: 'add_constraint', summary: 'if coverage < 80%', entities: { on_true: 'pass', on_false: 'fail' } }),
    );
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('branch');
    expect(result.steps[0].on_true).toBe('pass');
    expect(result.steps[0].on_false).toBe('fail');
  });

  it('modify updates matching proposed_skill description', () => {
    const card = makePipelineCard();
    card.proposed_skills = [{ name: 'lint', type: 'skill', description: 'old' }];
    const result = applyIntentToPipelineCard(
      card,
      makeIntent({ type: 'modify', summary: 'new lint desc', entities: { target_skill: 'lint' } }),
    );
    expect(result.proposed_skills[0].description).toBe('new lint desc');
  });

  it('modify with remove_step removes step and re-indexes', () => {
    const card = makePipelineCard();
    card.steps = [
      { order: 0, type: 'skill', label: 'step-a', skill_name: null, instruction: null, revision_target: null, max_revision_cycles: null, condition: null, on_true: null, on_false: null },
      { order: 1, type: 'skill', label: 'step-b', skill_name: null, instruction: null, revision_target: null, max_revision_cycles: null, condition: null, on_true: null, on_false: null },
      { order: 2, type: 'skill', label: 'step-c', skill_name: null, instruction: null, revision_target: null, max_revision_cycles: null, condition: null, on_true: null, on_false: null },
    ];
    const result = applyIntentToPipelineCard(
      card,
      makeIntent({ type: 'modify', summary: 'remove b', entities: { remove_step: 'step-b' } }),
    );
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].label).toBe('step-a');
    expect(result.steps[0].order).toBe(0);
    expect(result.steps[1].label).toBe('step-c');
    expect(result.steps[1].order).toBe(1);
  });

  it.each(['confirm', 'settle_signal', 'question', 'off_topic', 'style_preference'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makePipelineCard({ name: 'keep' });
      const result = applyIntentToPipelineCard(card, makeIntent({ type, summary: 'x' }));
      expect(result).toEqual(card);
    },
  );
});

// ─── AdapterCard ───

describe('applyIntentToAdapterCard', () => {
  it('new_intent detects platform names from summary', () => {
    const result = applyIntentToAdapterCard(
      makeAdapterCard(),
      makeIntent({ type: 'new_intent', summary: 'set up discord and telegram' }),
    );
    expect(result.platforms.some((p) => p.platform === 'discord')).toBe(true);
    expect(result.platforms.some((p) => p.platform === 'telegram')).toBe(true);
  });

  it('new_intent does not add duplicate platforms', () => {
    const card = makeAdapterCard();
    card.platforms = [{ platform: 'discord', enabled: true, role: '' }];
    const result = applyIntentToAdapterCard(
      card,
      makeIntent({ type: 'new_intent', summary: 'discord' }),
    );
    expect(result.platforms.filter((p) => p.platform === 'discord')).toHaveLength(1);
  });

  it('add_info sets role on existing platform', () => {
    const card = makeAdapterCard();
    card.platforms = [{ platform: 'x', enabled: true, role: '' }];
    const result = applyIntentToAdapterCard(
      card,
      makeIntent({ type: 'add_info', summary: '', entities: { x: 'posting bot' } }),
    );
    expect(result.platforms[0].role).toBe('posting bot');
  });

  it('set_boundary updates platform role', () => {
    const card = makeAdapterCard();
    card.platforms = [{ platform: 'telegram', enabled: true, role: '' }];
    const result = applyIntentToAdapterCard(
      card,
      makeIntent({ type: 'set_boundary', summary: 'read only', entities: { platform: 'telegram' } }),
    );
    expect(result.platforms[0].role).toBe('read only');
  });

  it.each(['add_constraint', 'add_evaluator_rule', 'confirm', 'settle_signal', 'modify', 'question', 'off_topic', 'style_preference'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makeAdapterCard();
      const result = applyIntentToAdapterCard(card, makeIntent({ type, summary: 'x' }));
      expect(result).toEqual(card);
    },
  );
});

// ─── CommerceCard ───

describe('applyIntentToCommerceCard', () => {
  it('new_intent adds offering', () => {
    const result = applyIntentToCommerceCard(
      makeCommerceCard(),
      makeIntent({ type: 'new_intent', summary: 'premium plan' }),
    );
    expect(result.offerings).toHaveLength(1);
    expect(result.offerings[0].name).toBe('premium plan');
    expect(result.offerings[0].type).toBe('stall_slot');
  });

  it('add_info adds offerings from entities with offering_type', () => {
    const result = applyIntentToCommerceCard(
      makeCommerceCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { offering_type: 'event_ticket', vip: 'VIP pass' } }),
    );
    // offering_type itself becomes an offering entry too (current behavior)
    const vipOffering = result.offerings.find((o) => o.name === 'vip');
    expect(vipOffering).toBeDefined();
    expect(vipOffering!.type).toBe('event_ticket');
  });

  it('set_boundary adds pricing_rule', () => {
    const result = applyIntentToCommerceCard(
      makeCommerceCard(),
      makeIntent({ type: 'set_boundary', summary: 'no discount below cost' }),
    );
    expect(result.pricing_rules).toHaveLength(1);
    expect(result.pricing_rules[0].name).toBe('no discount below cost');
  });

  it('add_constraint adds pricing_rule', () => {
    const result = applyIntentToCommerceCard(
      makeCommerceCard(),
      makeIntent({ type: 'add_constraint', summary: 'max 50% off' }),
    );
    expect(result.pricing_rules).toHaveLength(1);
  });

  it('modify updates matching offering description', () => {
    const card = makeCommerceCard();
    card.offerings = [{ type: 'stall_slot', name: 'basic-plan', description: 'old', base_price: null, capacity: null, duration: null }];
    const result = applyIntentToCommerceCard(
      card,
      makeIntent({ type: 'modify', summary: 'updated desc', entities: { target_name: 'basic-plan' } }),
    );
    expect(result.offerings[0].description).toBe('updated desc');
  });

  it('modify updates matching pricing_rule condition', () => {
    const card = makeCommerceCard();
    card.pricing_rules = [{ name: 'holiday-rule', condition: 'old', adjustment_pct: 0 }];
    const result = applyIntentToCommerceCard(
      card,
      makeIntent({ type: 'modify', summary: 'new condition', entities: { target_name: 'holiday-rule' } }),
    );
    expect(result.pricing_rules[0].condition).toBe('new condition');
  });

  it.each(['add_evaluator_rule', 'confirm', 'settle_signal', 'question', 'off_topic', 'style_preference'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makeCommerceCard();
      const result = applyIntentToCommerceCard(card, makeIntent({ type, summary: 'x' }));
      expect(result).toEqual(card);
    },
  );
});

// ─── OrgCard ───

describe('applyIntentToOrgCard', () => {
  it('new_intent sets director name and role', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'new_intent', summary: 'CTO' }),
    );
    expect(result.director).not.toBeNull();
    expect(result.director!.name).toBe('CTO');
    expect(result.director!.role).toBe('CTO');
  });

  it('add_info creates department or adds worker to existing', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'add_info', summary: '', entities: { engineering: 'Alice' } }),
    );
    expect(result.departments).toHaveLength(1);
    expect(result.departments[0].name).toBe('engineering');
    expect(result.departments[0].workers).toContain('Alice');
  });

  it('add_info adds worker to existing department without duplicates', () => {
    const card = makeOrgCard();
    card.departments = [{ name: 'engineering', chief: null, workers: ['Alice'], pipeline_refs: [] }];
    const result = applyIntentToOrgCard(
      card,
      makeIntent({ type: 'add_info', summary: '', entities: { engineering: 'Alice' } }),
    );
    expect(result.departments[0].workers.filter((w) => w === 'Alice')).toHaveLength(1);
  });

  it('add_info adds new worker to existing department', () => {
    const card = makeOrgCard();
    card.departments = [{ name: 'engineering', chief: null, workers: ['Alice'], pipeline_refs: [] }];
    const result = applyIntentToOrgCard(
      card,
      makeIntent({ type: 'add_info', summary: '', entities: { engineering: 'Bob' } }),
    );
    expect(result.departments[0].workers).toContain('Bob');
    expect(result.departments[0].workers).toHaveLength(2);
  });

  it('set_boundary hard sets governance.cycle', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'set_boundary', summary: 'weekly', enforcement: 'hard' }),
    );
    expect(result.governance.cycle).toBe('weekly');
  });

  it('set_boundary hard with chief_order entity pushes to chief_order', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'set_boundary', summary: 'weekly', enforcement: 'hard', entities: { chief_order: 'review first' } }),
    );
    expect(result.governance.chief_order).toContain('review first');
  });

  it('set_boundary soft sets governance.escalation', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'set_boundary', summary: 'escalate to CTO', enforcement: 'soft' }),
    );
    expect(result.governance.escalation).toBe('escalate to CTO');
  });

  it('add_constraint pushes to chief_order', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'add_constraint', summary: 'approval required' }),
    );
    expect(result.governance.chief_order).toContain('approval required');
  });

  it('style_preference sets director.style', () => {
    const result = applyIntentToOrgCard(
      makeOrgCard(),
      makeIntent({ type: 'style_preference', summary: 'hands-off' }),
    );
    expect(result.director!.style).toBe('hands-off');
  });

  it('modify updates matching department chief', () => {
    const card = makeOrgCard();
    card.departments = [{ name: 'design', chief: null, workers: [], pipeline_refs: [] }];
    const result = applyIntentToOrgCard(
      card,
      makeIntent({ type: 'modify', summary: 'new chief', entities: { target_department: 'design' } }),
    );
    expect(result.departments[0].chief).toBe('new chief');
  });

  it('modify without matching department is a no-op', () => {
    const card = makeOrgCard();
    const result = applyIntentToOrgCard(
      card,
      makeIntent({ type: 'modify', summary: 'x', entities: { target_department: 'nonexistent' } }),
    );
    expect(result).toEqual(card);
  });

  it.each(['add_evaluator_rule', 'confirm', 'settle_signal', 'question', 'off_topic', 'query_status', 'query_history'] as const)(
    '%s is a no-op',
    (type) => {
      const card = makeOrgCard();
      const result = applyIntentToOrgCard(card, makeIntent({ type, summary: 'x' }));
      expect(result).toEqual(card);
    },
  );
});

// ─── applyIntent dispatcher ───

describe('applyIntent', () => {
  it('dispatches to world card handler', () => {
    const card = makeWorldCard();
    const result = applyIntent('world', card, makeIntent({ type: 'new_intent', summary: 'goal' }));
    expect((result as WorldCard).goal).toBe('goal');
  });

  it('dispatches to workflow card handler', () => {
    const card = makeWorkflowCard();
    const result = applyIntent('workflow', card, makeIntent({ type: 'new_intent', summary: 'wf' }));
    expect((result as WorkflowCard).name).toBe('wf');
  });

  it('dispatches to task card handler', () => {
    const card = makeTaskCard();
    const result = applyIntent('task', card, makeIntent({ type: 'new_intent', summary: 'task' }));
    expect((result as TaskCard).intent).toBe('task');
  });

  it('dispatches to pipeline card handler', () => {
    const card = makePipelineCard();
    const result = applyIntent('pipeline', card, makeIntent({ type: 'new_intent', summary: 'pipe' }));
    expect((result as PipelineCard).name).toBe('pipe');
  });

  it('dispatches to adapter card handler', () => {
    const card = makeAdapterCard();
    const result = applyIntent('adapter', card, makeIntent({ type: 'new_intent', summary: 'discord' }));
    expect((result as AdapterCard).platforms.some((p) => p.platform === 'discord')).toBe(true);
  });

  it('dispatches to commerce card handler', () => {
    const card = makeCommerceCard();
    const result = applyIntent('commerce', card, makeIntent({ type: 'new_intent', summary: 'offer' }));
    expect((result as CommerceCard).offerings).toHaveLength(1);
  });

  it('dispatches to org card handler', () => {
    const card = makeOrgCard();
    const result = applyIntent('org', card, makeIntent({ type: 'new_intent', summary: 'dir' }));
    expect((result as OrgCard).director).not.toBeNull();
  });
});
