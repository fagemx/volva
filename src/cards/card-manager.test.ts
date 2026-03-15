import { describe, it, expect, beforeEach } from 'vitest';
import { CardManager, computeDiff } from './card-manager';
import type { WorldCard } from '../schemas/card';

const minimalWorldCard: WorldCard = {
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
};

const fullWorldCard: WorldCard = {
  goal: 'Build automated customer service',
  confirmed: {
    hard_rules: ['No refunds without human approval'],
    soft_rules: ['Avoid robotic tone'],
    must_have: ['24/7 availability'],
    success_criteria: ['90% satisfaction'],
  },
  pending: [
    { question: 'What languages?', context: 'User mentioned intl' },
  ],
  chief_draft: {
    name: 'ServiceBot',
    role: 'Support lead',
    style: 'Friendly',
  },
  budget_draft: { per_action: 0.05, per_day: 10 },
  current_proposal: 'Start with FAQ',
  version: 1,
};

// ─── Create Tests ───

describe('CardManager.create', () => {
  let mgr: CardManager;

  beforeEach(() => {
    mgr = new CardManager();
  });

  it('creates a WorldCard with version=1', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    expect(card.version).toBe(1);
    expect(card.type).toBe('world');
    expect(card.conversationId).toBe('conv1');
    expect(card.content.version).toBe(1);
  });

  it('assigns unique id', () => {
    const card1 = mgr.create('conv1', 'world', minimalWorldCard);
    const card2 = mgr.create('conv2', 'world', minimalWorldCard);
    expect(card1.id).not.toBe(card2.id);
  });

  it('sets timestamps', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    expect(card.createdAt).toBeTruthy();
    expect(card.updatedAt).toBeTruthy();
  });

  it('stores card retrievable by conversationId', () => {
    mgr.create('conv1', 'world', fullWorldCard);
    const found = mgr.getLatest('conv1');
    expect(found).not.toBeNull();
    expect((found!.content as WorldCard).goal).toBe('Build automated customer service');
  });
});

// ─── Update Tests ───

describe('CardManager.update', () => {
  let mgr: CardManager;

  beforeEach(() => {
    mgr = new CardManager();
  });

  it('increments version on update', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    const { card: updated } = mgr.update(card.id, {
      ...minimalWorldCard,
      goal: 'New goal',
    });
    expect(updated.version).toBe(2);
    expect(updated.content.version).toBe(2);
  });

  it('returns diff with changed fields', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    const { diff } = mgr.update(card.id, {
      ...minimalWorldCard,
      goal: 'New goal',
    });
    expect(diff.changed).toContain('goal');
  });

  it('consecutive updates increment version', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    const { card: v2 } = mgr.update(card.id, { ...minimalWorldCard, goal: 'v2' });
    const { card: v3 } = mgr.update(v2.id, { ...minimalWorldCard, goal: 'v3' });
    expect(v3.version).toBe(3);
  });

  it('throws on non-existent cardId', () => {
    expect(() => mgr.update('nonexistent', minimalWorldCard)).toThrow('Card not found');
  });
});

// ─── Diff Tests ───

describe('computeDiff', () => {
  it('detects changed fields', () => {
    const diff = computeDiff(
      { goal: 'old', version: 1 },
      { goal: 'new', version: 2 },
    );
    expect(diff.changed).toContain('goal');
    expect(diff.changed).toContain('version');
  });

  it('detects added fields', () => {
    const diff = computeDiff(
      { goal: null },
      { goal: 'new', extra: 'field' },
    );
    expect(diff.added).toContain('extra');
  });

  it('detects removed fields', () => {
    const diff = computeDiff(
      { goal: 'old', extra: 'field' },
      { goal: 'old' },
    );
    expect(diff.removed).toContain('extra');
  });

  it('returns empty diff for identical content', () => {
    const obj = { goal: 'same', version: 1 };
    const diff = computeDiff(obj, { ...obj });
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.changed).toHaveLength(0);
  });

  it('detects nested changes', () => {
    const diff = computeDiff(
      { confirmed: { hard_rules: ['rule1'] } },
      { confirmed: { hard_rules: ['rule1', 'rule2'] } },
    );
    expect(diff.changed.some(p => p.includes('hard_rules'))).toBe(true);
  });

  it('handles array element changes', () => {
    const diff = computeDiff(
      { items: [{ name: 'a' }] },
      { items: [{ name: 'b' }] },
    );
    expect(diff.changed).toContain('items[0].name');
  });
});

// ─── Edge Cases ───

describe('CardManager edge cases', () => {
  it('getLatest returns null for unknown conversation', () => {
    const mgr = new CardManager();
    expect(mgr.getLatest('unknown')).toBeNull();
  });

  it('diff method works without persisting', () => {
    const mgr = new CardManager();
    const diff = mgr.diff(minimalWorldCard, fullWorldCard);
    expect(diff.changed).toContain('goal');
  });
});
