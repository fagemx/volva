import { describe, it, expect } from 'vitest';
import { checkTransition } from './state-machine';
import type { PipelineCard } from '../schemas/card';

function makePipelineCard(opts: {
  stepsCount?: number;
  pendingCount?: number;
}): PipelineCard {
  return {
    name: 'test-pipeline',
    steps: Array.from({ length: opts.stepsCount ?? 0 }, (_, i) => ({
      order: i,
      type: 'skill' as const,
      label: `step ${i}`,
      skill_name: `skill-${i}`,
      instruction: null,
      revision_target: null,
      max_revision_cycles: null,
      condition: null,
      on_true: null,
      on_false: null,
    })),
    schedule: null,
    proposed_skills: [],
    pending: Array.from({ length: opts.pendingCount ?? 0 }, (_, i) => ({
      question: `q${i}`,
      context: `c${i}`,
    })),
    version: 1,
  };
}

describe('PipelineCard: EXPLORE transitions', () => {
  it('explore stays when steps < 2', () => {
    const card = makePipelineCard({ stepsCount: 1 });
    const result = checkTransition('explore', 'pipeline', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore -> focus when steps >= 2', () => {
    const card = makePipelineCard({ stepsCount: 2 });
    const result = checkTransition('explore', 'pipeline', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBe('pipeline has >= 2 steps');
  });
});

describe('PipelineCard: FOCUS -> SETTLE transitions', () => {
  it('focus -> settle on confirm with empty pending', () => {
    const card = makePipelineCard({ stepsCount: 2, pendingCount: 0 });
    const result = checkTransition('focus', 'pipeline', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('pending empty + user confirmed');
  });

  it('focus stays on confirm with non-empty pending', () => {
    const card = makePipelineCard({ stepsCount: 2, pendingCount: 1 });
    const result = checkTransition('focus', 'pipeline', card, 'confirm');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });

  it('focus -> settle on settle_signal', () => {
    const card = makePipelineCard({ stepsCount: 2, pendingCount: 1 });
    const result = checkTransition('focus', 'pipeline', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('user explicit settle signal');
  });

  it('focus -> settle on consecutiveNoMod >= 2', () => {
    const card = makePipelineCard({ stepsCount: 2, pendingCount: 1 });
    const result = checkTransition('focus', 'pipeline', card, 'add_info', 2);
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('consecutive 2 turns with no modification');
  });

  it('focus stays on consecutiveNoMod < 2', () => {
    const card = makePipelineCard({ stepsCount: 2, pendingCount: 1 });
    const result = checkTransition('focus', 'pipeline', card, 'add_info', 1);
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });
});

describe('PipelineCard: FOCUS -> EXPLORE rollback', () => {
  it('focus -> explore on new_intent', () => {
    const card = makePipelineCard({});
    const result = checkTransition('focus', 'pipeline', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('major direction change');
  });
});

describe('PipelineCard: SETTLE -> EXPLORE', () => {
  it('settle -> explore on new_intent', () => {
    const card = makePipelineCard({});
    const result = checkTransition('settle', 'pipeline', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('new topic after settlement');
  });

  it('settle stays on confirm', () => {
    const card = makePipelineCard({});
    const result = checkTransition('settle', 'pipeline', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBeNull();
  });
});
