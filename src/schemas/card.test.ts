import { describe, it, expect } from 'vitest';
import {
  CardTypeEnum,
  WorldCardSchema,
  WorkflowCardSchema,
  TaskCardSchema,
  OrgCardSchema,
  LlmPresetEnum,
  EvaluatorRuleSchema,
} from './card';

// ─── CardType ───

describe('CardTypeEnum', () => {
  it('accepts valid card types', () => {
    expect(CardTypeEnum.parse('world')).toBe('world');
    expect(CardTypeEnum.parse('workflow')).toBe('workflow');
    expect(CardTypeEnum.parse('task')).toBe('task');
  });

  it('rejects invalid card type', () => {
    expect(() => CardTypeEnum.parse('invalid')).toThrow();
  });
});

// ─── LlmPresetEnum ───

describe('LlmPresetEnum', () => {
  it('accepts valid presets', () => {
    expect(LlmPresetEnum.parse('economy')).toBe('economy');
    expect(LlmPresetEnum.parse('balanced')).toBe('balanced');
    expect(LlmPresetEnum.parse('performance')).toBe('performance');
  });

  it('rejects invalid preset', () => {
    expect(() => LlmPresetEnum.parse('turbo')).toThrow();
  });
});

// ─── WorldCard ───

describe('WorldCardSchema', () => {
  const validWorldCard = {
    goal: 'Build an automated customer service',
    target_repo: 'github.com/example/repo',
    confirmed: {
      hard_rules: [{ description: 'No refunds without human approval', scope: ['*'] }],
      soft_rules: [{ description: 'Avoid robotic tone', scope: ['*'] }],
      must_have: ['24/7 availability'],
      success_criteria: ['90% satisfaction rate'],
      evaluator_rules: [],
    },
    pending: [
      { question: 'What languages?', context: 'User mentioned international' },
    ],
    chief_draft: {
      name: 'ServiceBot',
      role: 'Customer support lead',
      style: 'Friendly but professional',
    },
    budget_draft: {
      per_action: 0.05,
      per_day: 10,
    },
    llm_preset: 'balanced',
    current_proposal: 'Start with FAQ automation',
    version: 1,
  };

  it('parses a valid WorldCard', () => {
    const result = WorldCardSchema.safeParse(validWorldCard);
    expect(result.success).toBe(true);
  });

  it('parses WorldCard with all nullable fields set to null', () => {
    const result = WorldCardSchema.safeParse({
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
    });
    expect(result.success).toBe(true);
  });

  it('accepts each llm_preset value', () => {
    for (const preset of ['economy', 'balanced', 'performance'] as const) {
      const result = WorldCardSchema.safeParse({ ...validWorldCard, llm_preset: preset });
      expect(result.success).toBe(true);
    }
  });

  it('accepts llm_preset as null', () => {
    const result = WorldCardSchema.safeParse({ ...validWorldCard, llm_preset: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid llm_preset value', () => {
    const result = WorldCardSchema.safeParse({ ...validWorldCard, llm_preset: 'turbo' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = WorldCardSchema.safeParse({ goal: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects version < 1', () => {
    const result = WorldCardSchema.safeParse({
      ...validWorldCard,
      version: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer version', () => {
    const result = WorldCardSchema.safeParse({
      ...validWorldCard,
      version: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects version as string', () => {
    const result = WorldCardSchema.safeParse({
      ...validWorldCard,
      version: '1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid confirmed structure', () => {
    const result = WorldCardSchema.safeParse({
      ...validWorldCard,
      confirmed: { hard_rules: 'not an array' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid pending item', () => {
    const result = WorldCardSchema.safeParse({
      ...validWorldCard,
      pending: [{ question: 'missing context' }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── EvaluatorRule ───

describe('EvaluatorRuleSchema', () => {
  const validRule = {
    name: 'price-cap',
    trigger: 'price_adjustment',
    condition: 'adjustment_percent <= 20',
    on_fail: { risk: 'high', action: 'reject' },
  };

  it('parses a valid evaluator rule', () => {
    const result = EvaluatorRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = EvaluatorRuleSchema.safeParse({
      trigger: validRule.trigger,
      condition: validRule.condition,
      on_fail: validRule.on_fail,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid risk level', () => {
    const result = EvaluatorRuleSchema.safeParse({
      ...validRule,
      on_fail: { risk: 'critical', action: 'warn' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid action', () => {
    const result = EvaluatorRuleSchema.safeParse({
      ...validRule,
      on_fail: { risk: 'low', action: 'delete' },
    });
    expect(result.success).toBe(false);
  });
});

// ─── WorkflowCard ───

describe('WorkflowCardSchema', () => {
  const validWorkflowCard = {
    name: 'Content Review Pipeline',
    purpose: 'AI review then human approval before publishing',
    steps: [
      {
        order: 0,
        description: 'AI content screening',
        skill: 'content-review',
        conditions: 'New post submitted',
      },
      {
        order: 1,
        description: 'Human final approval',
        skill: null,
        conditions: 'AI passes review',
      },
    ],
    confirmed: {
      triggers: ['New post submitted'],
      exit_conditions: ['Post published or rejected'],
      failure_handling: ['Escalate to admin'],
    },
    pending: [],
    version: 1,
  };

  it('parses a valid WorkflowCard', () => {
    const result = WorkflowCardSchema.safeParse(validWorkflowCard);
    expect(result.success).toBe(true);
  });

  it('parses WorkflowCard with minimal data', () => {
    const result = WorkflowCardSchema.safeParse({
      name: null,
      purpose: null,
      steps: [],
      confirmed: {
        triggers: [],
        exit_conditions: [],
        failure_handling: [],
      },
      pending: [],
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects version < 1', () => {
    const result = WorkflowCardSchema.safeParse({
      ...validWorkflowCard,
      version: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid step (missing description)', () => {
    const result = WorkflowCardSchema.safeParse({
      ...validWorkflowCard,
      steps: [{ order: 0, skill: null, conditions: null }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative step order', () => {
    const result = WorkflowCardSchema.safeParse({
      ...validWorkflowCard,
      steps: [
        { order: -1, description: 'bad', skill: null, conditions: null },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ─── TaskCard ───

describe('TaskCardSchema', () => {
  const validTaskCard = {
    intent: 'Generate product copy for summer sale',
    inputs: {
      product: 'Sunscreen SPF50',
      tone: 'casual',
    },
    constraints: ['Under 280 characters', 'Include emoji'],
    success_condition: 'Client approves copy',
    version: 1,
  };

  it('parses a valid TaskCard', () => {
    const result = TaskCardSchema.safeParse(validTaskCard);
    expect(result.success).toBe(true);
  });

  it('parses TaskCard with empty inputs and constraints', () => {
    const result = TaskCardSchema.safeParse({
      intent: 'Quick lookup',
      inputs: {},
      constraints: [],
      success_condition: null,
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing intent', () => {
    const result = TaskCardSchema.safeParse({
      inputs: {},
      constraints: [],
      success_condition: null,
      version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects version < 1', () => {
    const result = TaskCardSchema.safeParse({
      ...validTaskCard,
      version: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string input values', () => {
    const result = TaskCardSchema.safeParse({
      ...validTaskCard,
      inputs: { count: 42 },
    });
    expect(result.success).toBe(false);
  });
});

// ─── OrgCard ───

describe('OrgCardSchema', () => {
  const validOrgCard = {
    director: {
      name: 'Alice',
      role: 'CTO',
      style: 'collaborative',
    },
    departments: [
      {
        name: 'Engineering',
        chief: 'Bob',
        workers: ['Carol', 'Dave'],
        pipeline_refs: ['ci-pipeline'],
      },
    ],
    governance: {
      cycle: 'weekly',
      chief_order: ['engineering', 'marketing'],
      escalation: 'escalate to director',
    },
    pending: [],
    version: 1,
  };

  it('parses a valid OrgCard', () => {
    const result = OrgCardSchema.safeParse(validOrgCard);
    expect(result.success).toBe(true);
  });

  it('parses OrgCard with all nullable fields set to null', () => {
    const result = OrgCardSchema.safeParse({
      director: null,
      departments: [],
      governance: {
        cycle: null,
        chief_order: [],
        escalation: null,
      },
      pending: [],
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('parses OrgCard with director fields set to null', () => {
    const result = OrgCardSchema.safeParse({
      ...validOrgCard,
      director: { name: null, role: null, style: null },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing departments', () => {
    const result = OrgCardSchema.safeParse({
      director: null,
      governance: validOrgCard.governance,
      pending: [],
      version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects version < 1', () => {
    const result = OrgCardSchema.safeParse({
      ...validOrgCard,
      version: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid department (missing name)', () => {
    const result = OrgCardSchema.safeParse({
      ...validOrgCard,
      departments: [{ chief: null, workers: [], pipeline_refs: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts org as valid card type', () => {
    expect(CardTypeEnum.parse('org')).toBe('org');
  });
});
