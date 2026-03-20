import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { CardManager } from '../cards/card-manager';
import { cardRoutes } from './cards';
import type { WorldCard } from '../schemas/card';

const minimalWorldCard: WorldCard = {
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
};

let db: Database;
let cardManager: CardManager;
let app: Hono;

beforeEach(() => {
  db = createDb(':memory:');
  initSchema(db);
  db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv1', 'world_design', 'explore')");
  db.run("INSERT INTO conversations (id, mode, phase) VALUES ('conv2', 'world_design', 'explore')");
  cardManager = new CardManager(db);
  app = new Hono();
  app.route('/', cardRoutes({ cardManager }));
});

// ─── GET /api/conversations/:id/card ───

describe('GET /api/conversations/:id/card', () => {
  it('returns latest card for conversation', async () => {
    cardManager.create('conv1', 'world', minimalWorldCard);

    const res = await app.request('/api/conversations/conv1/card');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.conversationId).toBe('conv1');
    expect(data.type).toBe('world');
    expect(data.version).toBe(1);
  });

  it('returns the highest version as latest', async () => {
    const card = cardManager.create('conv1', 'world', minimalWorldCard);
    cardManager.update(card.id, { ...minimalWorldCard, goal: 'v2 goal' });

    const res = await app.request('/api/conversations/conv1/card');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.version).toBe(2);

    const content = data.content as Record<string, unknown>;
    expect(content.goal).toBe('v2 goal');
  });

  it('returns 404 for conversation with no card', async () => {
    const res = await app.request('/api/conversations/conv1/card');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns 404 for nonexistent conversation', async () => {
    const res = await app.request('/api/conversations/nonexistent/card');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
  });
});

// ─── GET /api/conversations/:id/card/version/:version ───

describe('GET /api/conversations/:id/card/version/:version', () => {
  it('returns specific version of a card', async () => {
    const card = cardManager.create('conv1', 'world', minimalWorldCard);
    cardManager.update(card.id, { ...minimalWorldCard, goal: 'v2 goal' });

    const res = await app.request('/api/conversations/conv1/card/version/1');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.version).toBe(1);

    const content = data.content as Record<string, unknown>;
    expect(content.goal).toBeNull();
  });

  it('returns 404 for nonexistent version', async () => {
    cardManager.create('conv1', 'world', minimalWorldCard);

    const res = await app.request('/api/conversations/conv1/card/version/99');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid version string', async () => {
    const res = await app.request('/api/conversations/conv1/card/version/abc');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for version less than 1', async () => {
    const res = await app.request('/api/conversations/conv1/card/version/0');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_INPUT');
  });
});

// ─── GET /api/conversations/:id/card/history ───

describe('GET /api/conversations/:id/card/history', () => {
  it('returns all versions in order', async () => {
    const card = cardManager.create('conv1', 'world', minimalWorldCard);
    const { card: v2 } = cardManager.update(card.id, { ...minimalWorldCard, goal: 'v2' });
    cardManager.update(v2.id, { ...minimalWorldCard, goal: 'v3' });

    const res = await app.request('/api/conversations/conv1/card/history');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(3);
    expect(data[0].version).toBe(1);
    expect(data[1].version).toBe(2);
    expect(data[2].version).toBe(3);
  });

  it('returns empty array for conversation with no card', async () => {
    const res = await app.request('/api/conversations/conv1/card/history');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(0);
  });

  it('does not include cards from other conversations', async () => {
    cardManager.create('conv1', 'world', minimalWorldCard);
    cardManager.create('conv2', 'world', minimalWorldCard);

    const res = await app.request('/api/conversations/conv1/card/history');
    const json = (await res.json()) as Record<string, unknown>;

    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(1);
    expect(data[0].conversationId).toBe('conv1');
  });
});

// ─── GET /api/conversations/:id/card/diffs ───

describe('GET /api/conversations/:id/card/diffs', () => {
  it('returns diff history after updates', async () => {
    const card = cardManager.create('conv1', 'world', minimalWorldCard);
    const { card: v2 } = cardManager.update(card.id, { ...minimalWorldCard, goal: 'v2' });
    cardManager.update(v2.id, { ...minimalWorldCard, goal: 'v3' });

    const res = await app.request('/api/conversations/conv1/card/diffs');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(2);
    expect(data[0].fromVersion).toBe(1);
    expect(data[0].toVersion).toBe(2);
    expect(data[1].fromVersion).toBe(2);
    expect(data[1].toVersion).toBe(3);
  });

  it('returns empty array for card with no updates', async () => {
    cardManager.create('conv1', 'world', minimalWorldCard);

    const res = await app.request('/api/conversations/conv1/card/diffs');
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(0);
  });

  it('diff entries contain changed paths', async () => {
    const card = cardManager.create('conv1', 'world', minimalWorldCard);
    cardManager.update(card.id, { ...minimalWorldCard, goal: 'New goal' });

    const res = await app.request('/api/conversations/conv1/card/diffs');
    const json = (await res.json()) as Record<string, unknown>;

    const data = json.data as Record<string, unknown>[];
    const diff = data[0].diff as Record<string, unknown>;
    const changed = diff.changed as string[];
    expect(changed).toContain('goal');
  });

  it('does not return diffs from other conversations', async () => {
    const card1 = cardManager.create('conv1', 'world', minimalWorldCard);
    const card2 = cardManager.create('conv2', 'world', minimalWorldCard);
    cardManager.update(card1.id, { ...minimalWorldCard, goal: 'conv1 goal' });
    cardManager.update(card2.id, { ...minimalWorldCard, goal: 'conv2 goal' });

    const res = await app.request('/api/conversations/conv1/card/diffs');
    const json = (await res.json()) as Record<string, unknown>;

    const data = json.data as Record<string, unknown>[];
    expect(data).toHaveLength(1);
  });
});

// ─── CARD-01: Version increment on update ───

describe('CARD-01: version increment through route', () => {
  it('card version increments on each update', async () => {
    const card = cardManager.create('conv1', 'world', minimalWorldCard);
    const { card: v2 } = cardManager.update(card.id, { ...minimalWorldCard, goal: 'v2' });
    cardManager.update(v2.id, { ...minimalWorldCard, goal: 'v3' });

    const res = await app.request('/api/conversations/conv1/card');
    const json = (await res.json()) as Record<string, unknown>;

    const data = json.data as Record<string, unknown>;
    expect(data.version).toBe(3);

    const content = data.content as Record<string, unknown>;
    expect(content.version).toBe(3);
  });
});
