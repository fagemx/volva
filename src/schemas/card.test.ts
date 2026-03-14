import { describe, it, expect } from 'vitest';
import {
  CardTypeEnum,
  WorldCardSchema,
  WorkflowCardSchema,
  TaskCardSchema,
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

// ─── WorldCard ───

describe('WorldCardSchema', () => {
  const validWorldCard = {
    goal: 'Build an automated customer service',
    confirmed: {
      hard_rules: ['No refunds without human approval'],
      soft_rules: ['Avoid robotic tone'],
      must_have: ['24/7 availability'],
      success_criteria: ['90% satisfaction rate'],
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
      confirmed: {
        hard_rules: [],
        soft_rules: [],
        must_have: [],
        success_criteria: [],
      },
      pending: [],
      chief_draft: null,
      budget_draft: null,
      current_proposal: null,
      version: 1,
    });
    expect(result.success).toBe(true);
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
