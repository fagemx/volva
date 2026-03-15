import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
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
    getVillage: vi.fn(),
    getActiveConstitution: vi.fn(),
    getChiefs: vi.fn(),
  } as unknown as ThyraClient;
}

function createTestApp(llm: LLMClient, thyra: ThyraClient) {
  const db = createDb(':memory:');
  initSchema(db);
  const cardManager = new CardManager(db);

  const app = new Hono();
  app.route('/', conversationRoutes({ db, llm, cardManager, thyra }));
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

// ─── W2: Existing Village Loading ───

describe('W2: Existing Village Loading', () => {
  it('creates conversation with village_id and pre-populated card', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app, db } = createTestApp(llm, thyra);

    (thyra.getVillage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'v-1', name: 'My Village', target_repo: 'org/repo',
    });
    (thyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'c-1', village_id: 'v-1',
      rules: [
        { description: 'No direct DB access', enforcement: 'hard', scope: ['*'] },
        { description: 'Prefer async', enforcement: 'soft', scope: ['api'] },
      ],
    });
    (thyra.getChiefs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'ch-1', village_id: 'v-1', name: 'Support Chief', role: 'support', personality: 'kind' },
    ]);

    const res = await jsonPost(app, '/api/conversations', {
      village_id: 'v-1',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.village_id).toBe('v-1');
    expect(data.preloaded).toBe(true);
    expect(data.phase).toBe('explore');

    // Verify village_id stored in DB
    const conv = db
      .query('SELECT village_id FROM conversations WHERE id = ?')
      .get(data.id as string) as Record<string, unknown>;
    expect(conv.village_id).toBe('v-1');

    // Verify card was pre-populated
    const cardRes = await app.request(`/api/conversations/${data.id as string}/card`);
    const cardJson = (await cardRes.json()) as Record<string, unknown>;
    const cardData = cardJson.data as Record<string, unknown>;
    expect(cardData).not.toBeNull();

    const content = cardData.content as Record<string, unknown>;
    expect(content.goal).toBe('Modify: My Village');
    expect(content.target_repo).toBe('org/repo');

    const confirmed = content.confirmed as Record<string, unknown>;
    const hardRules = confirmed.hard_rules as Record<string, unknown>[];
    expect(hardRules).toHaveLength(1);
    expect(hardRules[0].description).toBe('[existing] No direct DB access');

    const softRules = confirmed.soft_rules as Record<string, unknown>[];
    expect(softRules).toHaveLength(1);
    expect(softRules[0].description).toBe('[existing] Prefer async');

    const chiefDraft = content.chief_draft as Record<string, unknown>;
    expect(chiefDraft.name).toBe('Support Chief');
  });

  it('returns graceful error when Thyra is unavailable', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    (thyra.getVillage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Connection refused'),
    );

    const res = await jsonPost(app, '/api/conversations', {
      village_id: 'v-1',
    });
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);

    const err = json.error as Record<string, unknown>;
    expect(err.code).toBe('THYRA_UNAVAILABLE');
  });

  it('creates normal conversation when no village_id provided', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    const res = await jsonPost(app, '/api/conversations', {});
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    const data = json.data as Record<string, unknown>;
    expect(data.village_id).toBeNull();
    expect(data.preloaded).toBe(false);
  });
});

// ─── Modify Intent ───

describe('Modify intent in card updates', () => {
  it('modifies existing rule when target_rule matches', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    // Set up village with existing rules
    (thyra.getVillage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'v-1', name: 'Village', target_repo: 'repo',
    });
    (thyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'c-1', village_id: 'v-1',
      rules: [
        { description: 'No direct DB access', enforcement: 'hard', scope: ['*'] },
      ],
    });
    (thyra.getChiefs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const createRes = await jsonPost(app, '/api/conversations', {
      village_id: 'v-1',
    });
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const conversationId = convData.id as string;

    // Mock LLM for modify intent
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: {
        type: 'modify',
        summary: 'Allow read-only DB access',
        entities: { target_rule: 'No direct DB access' },
      },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'Updated the rule.',
    );

    const msgRes = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: 'Change the DB rule to allow read-only access' },
    );
    expect(msgRes.status).toBe(200);

    // Check card
    const cardRes = await app.request(`/api/conversations/${conversationId}/card`);
    const cardJson = (await cardRes.json()) as Record<string, unknown>;
    const cardData = cardJson.data as Record<string, unknown>;
    const content = cardData.content as Record<string, unknown>;
    const confirmed = content.confirmed as Record<string, unknown>;
    const hardRules = confirmed.hard_rules as Record<string, unknown>[];

    expect(hardRules).toHaveLength(1);
    expect(hardRules[0].description).toBe('[changed] Allow read-only DB access');
  });

  it('adds new rule when target_rule does not match', async () => {
    const llm = createMockLlm();
    const thyra = createMockThyra();
    const { app } = createTestApp(llm, thyra);

    // Set up village with no rules
    (thyra.getVillage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'v-2', name: 'Village2', target_repo: 'repo2',
    });
    (thyra.getActiveConstitution as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'c-2', village_id: 'v-2', rules: [],
    });
    (thyra.getChiefs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const createRes = await jsonPost(app, '/api/conversations', {
      village_id: 'v-2',
    });
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    const conversationId = convData.id as string;

    // Mock LLM for modify intent with non-matching target
    (llm.generateStructured as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: {
        type: 'modify',
        summary: 'Must use HTTPS',
        entities: { target_rule: 'nonexistent rule' },
      },
    });
    (llm.generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      'Added new rule.',
    );

    const msgRes = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: 'Add a rule about HTTPS' },
    );
    expect(msgRes.status).toBe(200);

    // Check card
    const cardRes = await app.request(`/api/conversations/${conversationId}/card`);
    const cardJson = (await cardRes.json()) as Record<string, unknown>;
    const cardData = cardJson.data as Record<string, unknown>;
    const content = cardData.content as Record<string, unknown>;
    const confirmed = content.confirmed as Record<string, unknown>;
    const softRules = confirmed.soft_rules as Record<string, unknown>[];

    expect(softRules).toHaveLength(1);
    expect(softRules[0].description).toBe('[new] Must use HTTPS');
  });
});

// ─── GP-2: Full W1 Scenario ───

describe('GP-2: Full W1 Scenario', () => {
  let app: Hono;
  let db: ReturnType<typeof createDb>;
  let llm: ReturnType<typeof createMockLlm>;
  let thyra: ReturnType<typeof createMockThyra>;
  let conversationId: string;

  beforeAll(async () => {
    llm = createMockLlm();
    thyra = createMockThyra();
    ({ app, db } = createTestApp(llm, thyra));

    const mockStructured = vi.fn();
    const mockText = vi.fn();
    (llm as unknown as Record<string, unknown>).generateStructured = mockStructured;
    (llm as unknown as Record<string, unknown>).generateText = mockText;

    // T1: new_intent (explore)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: { type: 'new_intent', summary: '自動化客服系統' },
    });
    mockText.mockResolvedValueOnce('你想做什麼樣的客服？');

    // T2: add_info with 3 entities (explore)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: {
        type: 'add_info',
        summary: '產品介紹、庫存查詢、退款',
        entities: { cap1: '產品介紹', cap2: '庫存查詢', cap3: '退款處理' },
      },
    });
    mockText.mockResolvedValueOnce('退款要全自動還是轉人工？');

    // T3: set_boundary hard (explore -> focus)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: {
        type: 'set_boundary',
        summary: '退款必須轉人工',
        enforcement: 'hard',
      },
    });
    mockText.mockResolvedValueOnce('收到，退款轉人工。');

    // T4: add_info with 1 entity (focus)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: {
        type: 'add_info',
        summary: '情緒偵測',
        entities: { cap4: '情緒偵測' },
      },
    });
    mockText.mockResolvedValueOnce('好，情緒激動也轉人工。');

    // T5: add_constraint (focus)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: { type: 'add_constraint', summary: '庫存延遲不超過5分鐘' },
    });
    mockText.mockResolvedValueOnce('確認，庫存最多5分鐘。');

    // T6: style_preference (focus)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: { type: 'style_preference', summary: '專業有溫度' },
    });
    mockText.mockResolvedValueOnce('要生成設定嗎？');

    // T7: settle_signal (focus -> settle)
    mockStructured.mockResolvedValueOnce({
      ok: true,
      data: { type: 'settle_signal', summary: '生成' },
    });
    mockText.mockResolvedValueOnce('已生成客服village設定。');

    // Settlement: thyra mock
    (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      villageId: 'v-123',
    });

    // Create conversation
    const createRes = await jsonPost(app, '/api/conversations', {});
    const createJson = (await createRes.json()) as Record<string, unknown>;
    const convData = createJson.data as Record<string, unknown>;
    conversationId = convData.id as string;
  });

  it('T1-T2: explore phase accumulates card', async () => {
    // T1: new_intent
    const t1Res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '我想做自動化客服系統' },
    );
    const t1Json = (await t1Res.json()) as Record<string, unknown>;
    expect(t1Res.status).toBe(200);
    const t1Data = t1Json.data as Record<string, unknown>;
    expect(t1Data.phase).toBe('explore');

    // T2: add_info with 3 entities
    const t2Res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '需要產品介紹、庫存查詢、退款處理' },
    );
    const t2Json = (await t2Res.json()) as Record<string, unknown>;
    expect(t2Res.status).toBe(200);
    const t2Data = t2Json.data as Record<string, unknown>;
    expect(t2Data.phase).toBe('explore');

    // Card version should be 2 after T2 (create=v1, update=v2)
    expect(t2Data.cardVersion).toBe(2);

    // Verify card content via API
    const cardRes = await app.request(
      `/api/conversations/${conversationId}/card`,
    );
    const cardJson = (await cardRes.json()) as Record<string, unknown>;
    const cardData = cardJson.data as Record<string, unknown>;
    const content = cardData.content as Record<string, unknown>;
    const confirmed = content.confirmed as Record<string, unknown>;
    const mustHave = confirmed.must_have as string[];
    expect(mustHave).toHaveLength(3);
  });

  it('T3: explore -> focus transition', async () => {
    const res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '退款必須轉人工處理' },
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.phase).toBe('focus');

    // Verify DB phase
    const conv = db
      .query('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(conv.phase).toBe('focus');
  });

  it('T4-T6: focus phase refines card', async () => {
    // T4: add_info
    const t4Res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '需要情緒偵測功能' },
    );
    const t4Json = (await t4Res.json()) as Record<string, unknown>;
    expect(t4Res.status).toBe(200);
    const t4Data = t4Json.data as Record<string, unknown>;
    expect(t4Data.phase).toBe('focus');

    // T5: add_constraint
    const t5Res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '庫存延遲不超過5分鐘' },
    );
    const t5Json = (await t5Res.json()) as Record<string, unknown>;
    expect(t5Res.status).toBe(200);
    const t5Data = t5Json.data as Record<string, unknown>;
    expect(t5Data.phase).toBe('focus');

    // T6: style_preference
    const t6Res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '風格要專業有溫度' },
    );
    const t6Json = (await t6Res.json()) as Record<string, unknown>;
    expect(t6Res.status).toBe(200);
    const t6Data = t6Json.data as Record<string, unknown>;
    expect(t6Data.phase).toBe('focus');

    // Verify card accumulation
    const cardRes = await app.request(
      `/api/conversations/${conversationId}/card`,
    );
    const cardJson = (await cardRes.json()) as Record<string, unknown>;
    const cardData = cardJson.data as Record<string, unknown>;
    const content = cardData.content as Record<string, unknown>;
    const confirmed = content.confirmed as Record<string, unknown>;

    // must_have: 3 from T2 + 1 from T4 = 4
    expect(confirmed.must_have as string[]).toHaveLength(4);
    // hard_rules: 1 from T3
    expect(confirmed.hard_rules as unknown[]).toHaveLength(1);
    // soft_rules: 1 from T5 (add_constraint)
    expect(confirmed.soft_rules as unknown[]).toHaveLength(1);
    // chief_draft with style from T6
    const chiefDraft = content.chief_draft as Record<string, unknown>;
    expect(chiefDraft.style).toBe('專業有溫度');
  });

  it('T7: focus -> settle transition', async () => {
    const res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/messages`,
      { content: '好，幫我生成設定' },
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.phase).toBe('settle');

    // Verify DB phase
    const conv = db
      .query('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(conv.phase).toBe('settle');
  });

  it('settlement: village pack draft created', async () => {
    const res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/settle`,
      {},
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.target).toBe('village_pack');
    expect(data.status).toBe('draft');

    // YAML contains hard enforcement rule
    const yamlPayload = data.payload as string;
    expect(yamlPayload).toContain('enforcement: hard');

    // Settlement record in DB is draft
    const settlement = db
      .query('SELECT status FROM settlements WHERE conversation_id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(settlement.status).toBe('draft');
  });

  it('settlement: village pack applied via confirm', async () => {
    const res = await jsonPost(
      app,
      `/api/conversations/${conversationId}/settle/confirm`,
      {},
    );
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    const data = json.data as Record<string, unknown>;
    expect(data.status).toBe('applied');

    // Thyra called once
    expect((thyra as unknown as Record<string, ReturnType<typeof vi.fn>>).applyVillagePack).toHaveBeenCalledTimes(1);

    // Settlement record in DB is applied
    const settlement = db
      .query('SELECT status FROM settlements WHERE conversation_id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(settlement.status).toBe('applied');
  });

  it('final state: 14 messages, card v7, settlement applied', () => {
    // 7 user + 7 assistant = 14 messages
    const messages = db
      .query(
        'SELECT role FROM messages WHERE conversation_id = ? ORDER BY created_at',
      )
      .all(conversationId) as Record<string, unknown>[];
    expect(messages).toHaveLength(14);

    // Card final version = 7 (create=v1, 6 updates=v2..v7)
    const card = db
      .query(
        'SELECT version FROM cards WHERE conversation_id = ? ORDER BY version DESC LIMIT 1',
      )
      .get(conversationId) as Record<string, unknown>;
    expect(card.version).toBe(7);

    // Phase is settle
    const conv = db
      .query('SELECT phase FROM conversations WHERE id = ?')
      .get(conversationId) as Record<string, unknown>;
    expect(conv.phase).toBe('settle');
  });
});
