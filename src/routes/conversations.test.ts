import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createDb, initSchema } from '../db';
import { CardManager } from '../cards/card-manager';
import { conversationRoutes } from './conversations';
import type { LLMClient } from '../llm/client';
import type { ThyraClient } from '../thyra-client/client';
import type { Database } from 'bun:sqlite';

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
    getVillage: vi.fn(),
    getActiveConstitution: vi.fn(),
    getChiefs: vi.fn(),
    getSkills: vi.fn().mockResolvedValue([]),
  } as unknown as ThyraClient;
}

function jsonPost(app: Hono, path: string, body: Record<string, unknown>) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Conversation Routes', () => {
  let app: Hono;
  let db: Database;
  let llm: ReturnType<typeof createMockLlm>;
  let thyra: ReturnType<typeof createMockThyra>;
  let cardManager: CardManager;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    llm = createMockLlm();
    thyra = createMockThyra();
    cardManager = new CardManager(db);

    app = new Hono();
    app.route('/', conversationRoutes({ db, llm, cardManager, thyra }));
  });

  // ─── POST /api/conversations ───

  it('creates conversation with default mode (world_design)', async () => {
    const res = await jsonPost(app, '/api/conversations', {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.id).toBeDefined();
    expect(data.mode).toBe('world_design');
    expect(data.phase).toBe('explore');
    expect(data.village_id).toBeNull();
    expect(data.preloaded).toBe(false);
  });

  it('creates conversation with mode=workflow_design', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'workflow_design' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('workflow_design');
  });

  it('creates conversation with mode=task', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'task' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('task');
  });

  it('creates conversation with mode=pipeline_design', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'pipeline_design' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('pipeline_design');
  });

  it('creates conversation with mode=adapter_config', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'adapter_config' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('adapter_config');
  });

  it('creates conversation with mode=commerce_design', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'commerce_design' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('commerce_design');
  });

  it('creates conversation with mode=org_design', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'org_design' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('org_design');
  });

  it('rejects invalid mode', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'invalid_mode' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toContain('Invalid enum value');
  });

  it('creates conversation with village_id association', async () => {
    (thyra.getVillage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'v-1', name: 'Test Village', target_repo: 'org/repo',
    });
    (thyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'c-1', village_id: 'v-1', rules: [],
    });
    (thyra.getChiefs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const res = await jsonPost(app, '/api/conversations', { village_id: 'v-1' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.village_id).toBe('v-1');
    expect(data.preloaded).toBe(true);

    // Verify in DB
    const conv = db
      .query('SELECT village_id FROM conversations WHERE id = ?')
      .get(data.id as string) as Record<string, unknown>;
    expect(conv.village_id).toBe('v-1');
  });

  it('persists conversation to database', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'task' });
    const json = (await res.json()) as Record<string, unknown>;
    const data = json.data as Record<string, unknown>;

    const row = db
      .query('SELECT * FROM conversations WHERE id = ?')
      .get(data.id as string) as Record<string, unknown>;

    expect(row).not.toBeNull();
    expect(row.mode).toBe('task');
    expect(row.phase).toBe('explore');
  });

  it('requires village_id for world_management mode', async () => {
    const res = await jsonPost(app, '/api/conversations', { mode: 'world_management' });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toContain('village_id is required');
  });

  // ─── POST /api/conversations/:id/messages ───

  it('sends a message and receives a reply', async () => {
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: 'Build a chatbot' },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'What kind of chatbot?',
    );

    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const res = await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: 'I want to build a chatbot',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.reply).toBe('What kind of chatbot?');
    expect(data.phase).toBeDefined();
    expect(data.strategy).toBeDefined();
  });

  it('rejects empty content in message', async () => {
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const res = await jsonPost(app, `/api/conversations/${id}/messages`, {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toContain('content is required');
  });

  it('rejects non-string content in message', async () => {
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const res = await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: 123,
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it('increments turn number for each user message', async () => {
    // Mock two rounds of LLM calls
    (llm.generateStructured as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        data: { type: 'new_intent', summary: 'First' },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { type: 'add_info', summary: 'Second', entities: { x: 'y' } },
      });
    (llm.generateText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('Reply 1')
      .mockResolvedValueOnce('Reply 2');

    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    // Send first message
    await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: 'first message',
    });

    // Send second message
    await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: 'second message',
    });

    // Check turns in DB
    const messages = db
      .query('SELECT role, turn FROM messages WHERE conversation_id = ? ORDER BY created_at')
      .all(id) as Record<string, unknown>[];

    // 2 user + 2 assistant = 4 messages
    expect(messages).toHaveLength(4);
    // Turn 1: user + assistant
    expect(messages[0].turn).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[1].turn).toBe(1);
    expect(messages[1].role).toBe('assistant');
    // Turn 2: user + assistant
    expect(messages[2].turn).toBe(2);
    expect(messages[2].role).toBe('user');
    expect(messages[3].turn).toBe(2);
    expect(messages[3].role).toBe('assistant');
  });

  it('returns 404 for message to non-existent conversation', async () => {
    const res = await jsonPost(
      app,
      '/api/conversations/nonexistent-id/messages',
      { content: 'hello' },
    );
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('NOT_FOUND');
  });

  it('persists user and assistant messages to DB', async () => {
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: 'test' },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce('OK');

    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: 'hello world',
    });

    const messages = db
      .query('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at')
      .all(id) as Record<string, unknown>[];

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('hello world');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('OK');
  });

  it('returns 500 when handleTurn throws', async () => {
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('LLM unavailable'),
    );

    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const id = convData.id as string;

    const res = await jsonPost(app, `/api/conversations/${id}/messages`, {
      content: 'hello',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Internal server error');
  });

  // ─── Without Thyra client ───

  it('creates conversation without thyra client', async () => {
    const appNoThyra = new Hono();
    appNoThyra.route('/', conversationRoutes({ db, llm, cardManager }));

    const res = await jsonPost(appNoThyra, '/api/conversations', {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.mode).toBe('world_design');
  });

  it('rejects world_management mode without thyra client', async () => {
    const appNoThyra = new Hono();
    appNoThyra.route('/', conversationRoutes({ db, llm, cardManager }));

    const res = await jsonPost(appNoThyra, '/api/conversations', {
      mode: 'world_management',
      village_id: 'v-1',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });
});
