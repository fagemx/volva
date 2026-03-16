import { describe, it, expect } from 'vitest';
import { checkTransition } from './state-machine';
import type { WorldCard, WorkflowCard, TaskCard } from '../schemas/card';

function makeWorldCard(opts: {
  hardRules?: string[];
  mustHave?: string[];
  pendingCount?: number;
}): WorldCard {
  return {
    goal: 'test',
    target_repo: null,
    confirmed: {
      hard_rules: (opts.hardRules ?? []).map((r) => ({ description: r, scope: ['*'] })),
      soft_rules: [],
      must_have: opts.mustHave ?? [],
      success_criteria: [],
    },
    pending: Array.from({ length: opts.pendingCount ?? 0 }, (_, i) => ({
      question: `q${i}`,
      context: `c${i}`,
    })),
    chief_draft: null,
    budget_draft: null,
    llm_preset: null,
    current_proposal: null,
    version: 1,
  };
}

function makeWorkflowCard(opts: {
  stepsCount?: number;
  triggers?: string[];
  pendingCount?: number;
}): WorkflowCard {
  return {
    name: 'test-workflow',
    purpose: 'testing',
    steps: Array.from({ length: opts.stepsCount ?? 0 }, (_, i) => ({
      order: i,
      description: `step ${i}`,
      skill: null,
      conditions: null,
    })),
    confirmed: {
      triggers: opts.triggers ?? [],
      exit_conditions: [],
      failure_handling: [],
    },
    pending: Array.from({ length: opts.pendingCount ?? 0 }, (_, i) => ({
      question: `q${i}`,
      context: `c${i}`,
    })),
    version: 1,
  };
}

function makeTaskCard(opts: {
  intent?: string;
  constraints?: string[];
}): TaskCard {
  return {
    intent: opts.intent ?? '',
    inputs: {},
    constraints: opts.constraints ?? [],
    success_condition: null,
    version: 1,
  };
}

// ─── WorldCard Transitions ───

describe('WorldCard: EXPLORE -> FOCUS transitions', () => {
  it('explore -> focus when hard_rule exists and must_have >= 3', () => {
    const card = makeWorldCard({ hardRules: ['r1'], mustHave: ['a', 'b', 'c'] });
    const result = checkTransition('explore', 'world', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).not.toBeNull();
  });

  it('explore -> focus on set_boundary when must_have >= 2', () => {
    const card = makeWorldCard({ mustHave: ['a', 'b'] });
    const result = checkTransition('explore', 'world', card, 'set_boundary');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).not.toBeNull();
  });

  it('explore stays when must_have < 3 and no boundary', () => {
    const card = makeWorldCard({ mustHave: ['a'] });
    const result = checkTransition('explore', 'world', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays when set_boundary but must_have < 2', () => {
    const card = makeWorldCard({ mustHave: ['a'] });
    const result = checkTransition('explore', 'world', card, 'set_boundary');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays on settle_signal (cannot skip focus)', () => {
    const card = makeWorldCard({});
    const result = checkTransition('explore', 'world', card, 'settle_signal');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });
});

describe('WorldCard: FOCUS -> SETTLE transitions', () => {
  it('focus -> settle when pending empty and confirm', () => {
    const card = makeWorldCard({ pendingCount: 0 });
    const result = checkTransition('focus', 'world', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).not.toBeNull();
  });

  it('focus stays when pending not empty and confirm', () => {
    const card = makeWorldCard({ pendingCount: 2 });
    const result = checkTransition('focus', 'world', card, 'confirm');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });

  it('focus -> settle on explicit settle_signal', () => {
    const card = makeWorldCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'world', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).not.toBeNull();
  });
});

describe('WorldCard: FOCUS -> SETTLE via consecutive no-mod', () => {
  it('focus -> settle when consecutiveNoModTurns >= 2', () => {
    const card = makeWorldCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'world', card, 'add_info', 2);
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('consecutive 2 turns with no modification');
  });

  it('focus stays when consecutiveNoModTurns < 2', () => {
    const card = makeWorldCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'world', card, 'add_info', 1);
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });

  it('explore ignores consecutiveNoModTurns', () => {
    const card = makeWorldCard({});
    const result = checkTransition('explore', 'world', card, 'add_info', 5);
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });
});

describe('WorkflowCard: FOCUS -> SETTLE via consecutive no-mod', () => {
  it('focus -> settle when consecutiveNoModTurns >= 2', () => {
    const card = makeWorkflowCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'workflow', card, 'add_info', 2);
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('consecutive 2 turns with no modification');
  });

  it('focus stays when consecutiveNoModTurns < 2', () => {
    const card = makeWorkflowCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'workflow', card, 'add_info', 1);
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });
});

describe('TaskCard: FOCUS -> SETTLE via consecutive no-mod', () => {
  it('focus -> settle when consecutiveNoModTurns >= 2', () => {
    const card = makeTaskCard({ intent: 'test' });
    const result = checkTransition('focus', 'task', card, 'add_info', 2);
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('consecutive 2 turns with no modification');
  });

  it('focus stays when consecutiveNoModTurns < 2', () => {
    const card = makeTaskCard({ intent: 'test' });
    const result = checkTransition('focus', 'task', card, 'add_info', 1);
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });
});

describe('WorldCard: Rollback transitions', () => {
  it('focus -> explore on new_intent (rollback)', () => {
    const card = makeWorldCard({});
    const result = checkTransition('focus', 'world', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });

  it('settle -> explore on new_intent (new cycle)', () => {
    const card = makeWorldCard({});
    const result = checkTransition('settle', 'world', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });
});

describe('WorldCard: No-transition cases', () => {
  it('settle stays on confirm (no transition)', () => {
    const card = makeWorldCard({});
    const result = checkTransition('settle', 'world', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBeNull();
  });

  it('explore stays on add_info with insufficient card state', () => {
    const card = makeWorldCard({});
    const result = checkTransition('explore', 'world', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });
});

// ─── WorkflowCard Transitions ───

describe('WorkflowCard transitions', () => {
  it('explore -> focus when steps + triggers exist', () => {
    const card = makeWorkflowCard({ stepsCount: 2, triggers: ['on_message'] });
    const result = checkTransition('explore', 'workflow', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBe('steps defined + triggers set');
  });

  it('explore stays when no steps', () => {
    const card = makeWorkflowCard({ triggers: ['on_message'] });
    const result = checkTransition('explore', 'workflow', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays when no triggers', () => {
    const card = makeWorkflowCard({ stepsCount: 2 });
    const result = checkTransition('explore', 'workflow', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('focus -> settle on confirm with empty pending', () => {
    const card = makeWorkflowCard({ stepsCount: 1, triggers: ['t1'], pendingCount: 0 });
    const result = checkTransition('focus', 'workflow', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).not.toBeNull();
  });

  it('focus -> settle on settle_signal', () => {
    const card = makeWorkflowCard({ stepsCount: 1, triggers: ['t1'], pendingCount: 1 });
    const result = checkTransition('focus', 'workflow', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).not.toBeNull();
  });

  it('focus -> explore on new_intent (rollback)', () => {
    const card = makeWorkflowCard({});
    const result = checkTransition('focus', 'workflow', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });

  it('settle -> explore on new_intent', () => {
    const card = makeWorkflowCard({});
    const result = checkTransition('settle', 'workflow', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });
});

// ─── TaskCard Transitions ───

describe('TaskCard transitions', () => {
  it('explore -> settle fast-path on confirm with intent set', () => {
    const card = makeTaskCard({ intent: 'deploy to prod' });
    const result = checkTransition('explore', 'task', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('task intent set + user confirmed');
  });

  it('explore -> settle fast-path on settle_signal with intent set', () => {
    const card = makeTaskCard({ intent: 'deploy to prod' });
    const result = checkTransition('explore', 'task', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('task intent set + user confirmed');
  });

  it('explore stays on confirm when intent is empty', () => {
    const card = makeTaskCard({ intent: '' });
    const result = checkTransition('explore', 'task', card, 'confirm');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore -> focus when constraints exist but no confirm', () => {
    const card = makeTaskCard({ intent: 'test', constraints: ['no downtime'] });
    const result = checkTransition('explore', 'task', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBe('constraints defined');
  });

  it('focus -> settle on confirm', () => {
    const card = makeTaskCard({ intent: 'test' });
    const result = checkTransition('focus', 'task', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('user confirmed task');
  });

  it('focus -> settle on settle_signal', () => {
    const card = makeTaskCard({ intent: 'test' });
    const result = checkTransition('focus', 'task', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('user confirmed task');
  });

  it('settle -> explore on new_intent', () => {
    const card = makeTaskCard({ intent: 'old task' });
    const result = checkTransition('settle', 'task', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('new task after settlement');
  });

  it('focus -> explore on new_intent (rollback)', () => {
    const card = makeTaskCard({ intent: 'test' });
    const result = checkTransition('focus', 'task', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });
});
