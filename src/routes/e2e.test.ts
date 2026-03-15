import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createDb, initSchema } from '../db';
import { CardManager } from '../cards/card-manager';
import { conversationRoutes } from './conversations';
import { cardRoutes } from './cards';
import { settlementRoutes } from './settlements';
import type { LLMClient } from '../llm/client';
import type { ThyraClient } from '../thyra-client/client';

function createMockLlm() {
  return {
    generateStructured: vi.fn(),
    generateText: vi.fn(),
  } as unknown as LLMClient;
}

function createMockThyra() {
  return {
    applyVillagePack: vi.fn(),
    createVillage: vi.fn(),
    createConstitution: vi.fn(),
    createChief: vi.fn(),
    createSkill: vi.fn(),
    getHealth: vi.fn(),
  } as unknown as ThyraClient;
}

function createTestApp(llm: LLMClient, thyra: ThyraClient) {
  const db = createDb(':memory:');
  initSchema(db);
  const cardManager = new CardManager();

  const app = new Hono();
  app.route('/', conversationRoutes({ db, llm, cardManager }));
  app.route('/', cardRoutes({ cardManager }));
  app.route('/', settlementRoutes({ db, cardManager, thyra }));

  return { app, db, cardManager };
}

function jsonPost(app: Hono, path: string, body: Record<string, unknown>) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── GP-1: Minimum Closed Loop ───

describe('GP-1: Minimum Closed Loop', () => {
  let app: Hono;
  let db: ReturnType<typeof createDb>;
  let llm: ReturnType<typeof createMockLlm>;

  beforeEach(() => {
    llm = createMockLlm();
    const thyra = createMockThyra();
    ({ app, db } = createTestApp(llm, thyra));
  });

  it('creates a conversation with default mode', async () => {
    const res = await jsonPost(app, '/api/conversations', {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.id).toBeDefined();
    expect(data.mode).toBe('world_design');
    expect(data.phase).toBe('explore');
  });

  it('creates a conversation with explicit mode', async () => {
    const res = await jsonPost(app, '/api/conversations', {
      mode: 'workflow_design',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('workflow_design');
  });

  it('rejects invalid mode', async () => {
    const res = await jsonPost(app, '/api/conversations', {
      mode: 'invalid',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('sends a message and receives a reply', async () => {
    // Mock LLM: parseIntent + generateReply
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '我想做自動化客服' },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      '好的，你想做什麼樣的客服呢？',
    );

    // Create conversation first
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    // Send message
    const res = await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: '我想做自動化客服',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.reply).toBe('好的，你想做什麼樣的客服呢？');
    expect(data.phase).toBe('explore');
    expect(data.strategy).toBeDefined();
    expect(data.cardVersion).toBeGreaterThanOrEqual(1);
  });

  it('persists user and assistant messages to DB', async () => {
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '做客服' },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce('OK');

    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: '做客服',
    });

    const messages = db
      .query('SELECT role, content, turn FROM messages WHERE conversation_id = ? ORDER BY created_at')
      .all(id) as Record<string, unknown>[];

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('做客服');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('OK');
    expect(messages[0].turn).toBe(1);
    expect(messages[1].turn).toBe(1);
  });

  it('returns 404 for message to nonexistent conversation', async () => {
    const res = await jsonPost(
      app,
      '/api/conversations/nonexistent/messages',
      { content: 'hello' },
    );
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
  });

  it('returns error when content is missing', async () => {
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const res = await jsonPost(app, `/api/conversations/${id}/messages`, {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('gets card after first message', async () => {
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '做客服' },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce('OK');

    // Create + send message
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: '做客服',
    });

    // Get card
    const cardRes = await app.request(`/api/conversations/${id}/card`);
    const cardJson = (await cardRes.json()) as Record<string, unknown>;

    expect(cardRes.status).toBe(200);
    expect(cardJson.ok).toBe(true);

    const cardData = cardJson.data as Record<string, unknown>;
    expect(cardData).not.toBeNull();
    expect(cardData.version).toBeGreaterThanOrEqual(1);
    expect(cardData.type).toBe('world');
  });

  it('returns null card before any messages', async () => {
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const cardRes = await app.request(`/api/conversations/${id}/card`);
    const cardJson = (await cardRes.json()) as Record<string, unknown>;

    expect(cardRes.status).toBe(200);
    expect(cardJson.ok).toBe(true);
    expect(cardJson.data).toBeNull();
  });
});

// ─── Settlement Route ───

describe('Settlement route', () => {
  it('rejects settlement when not in settle phase', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const res = await jsonPost(app, `/api/conversations/${id}/settle`, {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_STATE');
  });

  it('returns 404 for nonexistent conversation', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    const res = await jsonPost(
      app,
      '/api/conversations/nonexistent/settle',
      {},
    );
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);
  });
});

// ─── API-01: Response format ───

describe('API-01: Response format', () => {
  it('all success responses have { ok: true, data }', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    const res = await jsonPost(app, '/api/conversations', {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(json).toHaveProperty('ok', true);
    expect(json).toHaveProperty('data');
    expect(json).not.toHaveProperty('error');
  });

  it('all error responses have { ok: false, error: { code, message } }', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    const res = await jsonPost(app, '/api/conversations', {
      mode: 'bad_mode',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(json).toHaveProperty('ok', false);
    expect(json).toHaveProperty('error');

    const err = json.error as Record<string, unknown>;
    expect(err).toHaveProperty('code');
    expect(err).toHaveProperty('message');
  });
});
