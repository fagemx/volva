import { describe, it, expect } from 'vitest';
import { checkTransition } from './state-machine';
import type { WorldCard } from '../schemas/card';

function makeCard(opts: {
  hardRules?: string[];
  mustHave?: string[];
  pendingCount?: number;
}): WorldCard {
  return {
    goal: 'test',
    confirmed: {
      hard_rules: opts.hardRules ?? [],
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
    current_proposal: null,
    version: 1,
  };
}

// Group 1: EXPLORE → FOCUS

describe('EXPLORE → FOCUS transitions', () => {
  it('explore → focus when hard_rule exists and must_have >= 3', () => {
    const card = makeCard({ hardRules: ['r1'], mustHave: ['a', 'b', 'c'] });
    const result = checkTransition('explore', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).not.toBeNull();
  });

  it('explore → focus on set_boundary when must_have >= 2', () => {
    const card = makeCard({ mustHave: ['a', 'b'] });
    const result = checkTransition('explore', card, 'set_boundary');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).not.toBeNull();
  });

  it('explore stays when must_have < 3 and no boundary', () => {
    const card = makeCard({ mustHave: ['a'] });
    const result = checkTransition('explore', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays when set_boundary but must_have < 2', () => {
    const card = makeCard({ mustHave: ['a'] });
    const result = checkTransition('explore', card, 'set_boundary');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays on settle_signal (cannot skip focus)', () => {
    const card = makeCard({});
    const result = checkTransition('explore', card, 'settle_signal');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });
});

// Group 2: FOCUS → SETTLE

describe('FOCUS → SETTLE transitions', () => {
  it('focus → settle when pending empty and confirm', () => {
    const card = makeCard({ pendingCount: 0 });
    const result = checkTransition('focus', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).not.toBeNull();
  });

  it('focus stays when pending not empty and confirm', () => {
    const card = makeCard({ pendingCount: 2 });
    const result = checkTransition('focus', card, 'confirm');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });

  it('focus → settle on explicit settle_signal', () => {
    const card = makeCard({ pendingCount: 1 });
    const result = checkTransition('focus', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).not.toBeNull();
  });
});

// Group 3: Rollback transitions

describe('Rollback transitions', () => {
  it('focus → explore on new_intent (rollback)', () => {
    const card = makeCard({});
    const result = checkTransition('focus', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });

  it('settle → explore on new_intent (new cycle)', () => {
    const card = makeCard({});
    const result = checkTransition('settle', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).not.toBeNull();
  });
});

// Group 4: No-transition cases

describe('No-transition cases', () => {
  it('settle stays on confirm (no transition)', () => {
    const card = makeCard({});
    const result = checkTransition('settle', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBeNull();
  });

  it('explore stays on add_info with insufficient card state', () => {
    const card = makeCard({});
    const result = checkTransition('explore', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });
});
