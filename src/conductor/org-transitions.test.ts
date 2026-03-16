import { describe, it, expect } from 'vitest';
import { checkTransition } from './state-machine';
import type { OrgCard } from '../schemas/card';

function makeOrgCard(opts?: {
  director?: OrgCard['director'];
  departments?: OrgCard['departments'];
  pendingCount?: number;
}): OrgCard {
  return {
    director: opts?.director ?? null,
    departments: opts?.departments ?? [],
    governance: { cycle: null, chief_order: [], escalation: null },
    pending: Array.from({ length: opts?.pendingCount ?? 0 }, (_, i) => ({
      question: `q${i}`,
      context: `c${i}`,
    })),
    version: 1,
  };
}

describe('OrgCard: EXPLORE -> FOCUS transitions', () => {
  it('explore -> focus when director set and departments >= 1', () => {
    const card = makeOrgCard({
      director: { name: 'Alice', role: 'CTO', style: null },
      departments: [{ name: 'Eng', chief: null, workers: [], pipeline_refs: [] }],
    });
    const result = checkTransition('explore', 'org', card, 'add_info');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBe('director set + departments >= 1');
  });

  it('explore stays when director is null', () => {
    const card = makeOrgCard({
      departments: [{ name: 'Eng', chief: null, workers: [], pipeline_refs: [] }],
    });
    const result = checkTransition('explore', 'org', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });

  it('explore stays when no departments', () => {
    const card = makeOrgCard({
      director: { name: 'Alice', role: 'CTO', style: null },
    });
    const result = checkTransition('explore', 'org', card, 'add_info');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBeNull();
  });
});

describe('OrgCard: FOCUS -> SETTLE transitions', () => {
  it('focus -> settle when pending empty and confirm', () => {
    const card = makeOrgCard({ pendingCount: 0 });
    const result = checkTransition('focus', 'org', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('pending empty + user confirmed');
  });

  it('focus stays when pending not empty and confirm', () => {
    const card = makeOrgCard({ pendingCount: 2 });
    const result = checkTransition('focus', 'org', card, 'confirm');
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });

  it('focus -> settle on settle_signal', () => {
    const card = makeOrgCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'org', card, 'settle_signal');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('user explicit settle signal');
  });

  it('focus -> settle when consecutiveNoModTurns >= 2', () => {
    const card = makeOrgCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'org', card, 'add_info', 2);
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBe('consecutive 2 turns with no modification');
  });

  it('focus stays when consecutiveNoModTurns < 2', () => {
    const card = makeOrgCard({ pendingCount: 1 });
    const result = checkTransition('focus', 'org', card, 'add_info', 1);
    expect(result.newPhase).toBe('focus');
    expect(result.reason).toBeNull();
  });
});

describe('OrgCard: Rollback and cycle transitions', () => {
  it('settle -> explore on new_intent', () => {
    const card = makeOrgCard();
    const result = checkTransition('settle', 'org', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('new topic after settlement');
  });

  it('focus -> explore on new_intent (rollback)', () => {
    const card = makeOrgCard();
    const result = checkTransition('focus', 'org', card, 'new_intent');
    expect(result.newPhase).toBe('explore');
    expect(result.reason).toBe('major direction change');
  });

  it('settle stays on confirm', () => {
    const card = makeOrgCard();
    const result = checkTransition('settle', 'org', card, 'confirm');
    expect(result.newPhase).toBe('settle');
    expect(result.reason).toBeNull();
  });
});
