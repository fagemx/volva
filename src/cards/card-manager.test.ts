import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'bun:sqlite';
import { CardManager, computeDiff } from './card-manager';
import { createDb, initSchema } from '../db';
import type { WorldCard } from '../schemas/card';

const minimalWorldCard: WorldCard = {
  goal: null,
  target_repo: null,
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
  target_repo: 'github.com/example/repo',
  confirmed: {
    hard_rules: [{ description: 'No refunds without human approval', scope: ['*'] }],
    soft_rules: [{ description: 'Avoid robotic tone', scope: ['*'] }],
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

let db: Database;
let mgr: CardManager;

beforeEach(() => {
  db = createDb(':memory:');
  initSchema(db);
  // Cards table has FK to conversations — insert a test conversation
  db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
  db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv2', 'world_design', 'explore')");
  mgr = new CardManager(db);
});

// ─── Create Tests ───

describe('CardManager.create', () => {
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
      { confirmed: { hard_rules: [{ description: 'rule1', scope: ['*'] }] } },
      { confirmed: { hard_rules: [{ description: 'rule1', scope: ['*'] }, { description: 'rule2', scope: ['*'] }] } },
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

// ─── Diff History Tests ───

describe('CardManager.getDiffHistory', () => {
  it('returns empty array for new card', () => {
    mgr.create('conv1', 'world', minimalWorldCard);
    const history = mgr.getDiffHistory('conv1');
    expect(history).toHaveLength(0);
  });

  it('returns one entry after first update', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    mgr.update(card.id, { ...minimalWorldCard, goal: 'Updated goal' });
    const history = mgr.getDiffHistory('conv1');
    expect(history).toHaveLength(1);
  });

  it('returns entries in version order after multiple updates', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    const { card: v2 } = mgr.update(card.id, { ...minimalWorldCard, goal: 'v2' });
    mgr.update(v2.id, { ...minimalWorldCard, goal: 'v3' });
    const history = mgr.getDiffHistory('conv1');
    expect(history).toHaveLength(2);
    expect(history[0].fromVersion).toBe(1);
    expect(history[0].toVersion).toBe(2);
    expect(history[1].fromVersion).toBe(2);
    expect(history[1].toVersion).toBe(3);
  });

  it('diff entries have correct fromVersion/toVersion', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    mgr.update(card.id, { ...minimalWorldCard, goal: 'New goal' });
    const history = mgr.getDiffHistory('conv1');
    expect(history[0].fromVersion).toBe(1);
    expect(history[0].toVersion).toBe(2);
  });

  it('diff entries contain correct added/removed/changed paths', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    mgr.update(card.id, { ...minimalWorldCard, goal: 'New goal' });
    const history = mgr.getDiffHistory('conv1');
    expect(history[0].diff.changed).toContain('goal');
  });

  it('does not return diffs from other conversations', () => {
    const card1 = mgr.create('conv1', 'world', minimalWorldCard);
    const card2 = mgr.create('conv2', 'world', minimalWorldCard);
    mgr.update(card1.id, { ...minimalWorldCard, goal: 'conv1 goal' });
    mgr.update(card2.id, { ...minimalWorldCard, goal: 'conv2 goal' });
    const history = mgr.getDiffHistory('conv1');
    expect(history).toHaveLength(1);
  });
});

// ─── Version History Tests ───

describe('CardManager.getVersionHistory', () => {
  it('returns all versions in order', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    const { card: v2 } = mgr.update(card.id, { ...minimalWorldCard, goal: 'v2' });
    mgr.update(v2.id, { ...minimalWorldCard, goal: 'v3' });

    const history = mgr.getVersionHistory('conv1');
    expect(history).toHaveLength(3);
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
    expect(history[2].version).toBe(3);
  });

  it('returns empty array for unknown conversation', () => {
    const history = mgr.getVersionHistory('unknown');
    expect(history).toHaveLength(0);
  });

  it('does not include other conversations', () => {
    mgr.create('conv1', 'world', minimalWorldCard);
    mgr.create('conv2', 'world', minimalWorldCard);

    const history = mgr.getVersionHistory('conv1');
    expect(history).toHaveLength(1);
  });
});

describe('CardManager.getVersion', () => {
  it('returns specific version', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    mgr.update(card.id, { ...minimalWorldCard, goal: 'v2 goal' });

    const v1 = mgr.getVersion('conv1', 1);
    const v2 = mgr.getVersion('conv1', 2);

    expect(v1).not.toBeNull();
    expect(v1!.version).toBe(1);
    expect((v1!.content as WorldCard).goal).toBeNull();

    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
    expect((v2!.content as WorldCard).goal).toBe('v2 goal');
  });

  it('returns null for nonexistent version', () => {
    mgr.create('conv1', 'world', minimalWorldCard);
    expect(mgr.getVersion('conv1', 99)).toBeNull();
  });

  it('returns null for unknown conversation', () => {
    expect(mgr.getVersion('unknown', 1)).toBeNull();
  });
});

// ─── Edge Cases ───

describe('CardManager edge cases', () => {
  it('getLatest returns null for unknown conversation', () => {
    expect(mgr.getLatest('unknown')).toBeNull();
  });

  it('diff method works without persisting', () => {
    const diff = mgr.diff(minimalWorldCard, fullWorldCard);
    expect(diff.changed).toContain('goal');
  });
});

// ─── DB Round-Trip Tests ───

describe('CardManager DB persistence', () => {
  it('persists cards to DB (round-trip)', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);

    const row = db.query('SELECT * FROM cards WHERE id = ?').get(card.id) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.conversation_id).toBe('conv1');
    expect(row.version).toBe(1);

    const content = JSON.parse(row.content as string) as Record<string, unknown>;
    expect(content.version).toBe(1);
  });

  it('stores version history in DB', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    mgr.update(card.id, { ...minimalWorldCard, goal: 'v2' });

    const rows = db.query('SELECT * FROM cards WHERE conversation_id = ? ORDER BY version')
      .all('conv1') as Record<string, unknown>[];

    expect(rows).toHaveLength(2);
    expect(rows[0].version).toBe(1);
    expect(rows[1].version).toBe(2);
  });

  it('getLatest returns the highest version', () => {
    const card = mgr.create('conv1', 'world', minimalWorldCard);
    mgr.update(card.id, { ...minimalWorldCard, goal: 'v2' });

    const latest = mgr.getLatest('conv1');
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(2);
    expect((latest!.content as WorldCard).goal).toBe('v2');
  });
});
