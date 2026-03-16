import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createDb, initSchema } from '../db';
import { CardManager } from '../cards/card-manager';
import { settlementRoutes } from './settlements';
import type { Database } from 'bun:sqlite';
import type { ThyraClient } from '../thyra-client/client';
import type { KarviClient } from '../karvi-client/client';
import type { WorldCard, WorkflowCard, TaskCard, PipelineCard, AdapterCard, CommerceCard, OrgCard } from '../schemas/card';

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

function createMockKarvi() {
  return {
    registerPipeline: vi.fn(),
    listPipelines: vi.fn(),
    deletePipeline: vi.fn(),
    getHealth: vi.fn(),
  } as unknown as KarviClient;
}

function jsonPost(app: Hono, path: string) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'Content-Type': 'application/json' },
  });
}

const WORLD_CARD_CONTENT: WorldCard = {
  goal: 'Test Village',
  target_repo: 'test-repo',
  confirmed: {
    hard_rules: [{ description: 'No production writes', scope: ['*'] }],
    soft_rules: [],
    must_have: ['deploy', 'monitor', 'alert'],
    success_criteria: ['uptime > 99%'],
    evaluator_rules: [],
  },
  pending: [],
  chief_draft: { name: 'Chief', role: 'leader', style: 'strict' },
  budget_draft: null,
  llm_preset: null,
  current_proposal: null,
  version: 1,
};

const PIPELINE_CARD_CONTENT: PipelineCard = {
  name: 'Daily Report Pipeline',
  steps: [
    {
      order: 0,
      type: 'skill',
      label: 'Fetch data',
      skill_name: 'data-fetcher',
      instruction: 'Pull daily metrics',
      revision_target: null,
      max_revision_cycles: null,
      condition: null,
      on_true: null,
      on_false: null,
    },
    {
      order: 1,
      type: 'gate',
      label: 'Quality check',
      skill_name: null,
      instruction: 'Verify data completeness',
      revision_target: null,
      max_revision_cycles: null,
      condition: 'data.rows > 0',
      on_true: 'continue',
      on_false: 'abort',
    },
  ],
  schedule: 'daily',
  proposed_skills: [
    { name: 'data-fetcher', type: 'retrieval', description: 'Fetches daily metrics' },
  ],
  pending: [],
  version: 1,
};

describe('Settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();

    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    // Create conversation in settle phase with a world card
    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'world', WORLD_CARD_CONTENT);
  });

  // ─── POST /settle ───

  describe('POST /settle', () => {
    it('creates a draft settlement record', async () => {
      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      const data = json.data as Record<string, unknown>;
      expect(data.status).toBe('draft');
      expect(data.id).toBeDefined();
      expect(data.target).toBe('village_pack');
      expect(typeof data.payload).toBe('string');
    });

    it('stores draft in DB without calling Thyra', async () => {
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      const row = db
        .query('SELECT * FROM settlements WHERE conversation_id = ?')
        .get(conversationId) as Record<string, unknown> | null;

      expect(row).not.toBeNull();
      expect(row!.status).toBe('draft');
      expect(row!.thyra_response).toBeNull();

      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock assertion
      expect(thyra.applyVillagePack).not.toHaveBeenCalled();
    });

    it('rejects if conversation is not in settle phase', async () => {
      db.run("UPDATE conversations SET phase = 'explore' WHERE id = ?", [conversationId]);

      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('INVALID_STATE');
    });

    it('rejects if no card found', async () => {
      const emptyConvId = crypto.randomUUID();
      db.run(
        "INSERT INTO conversations (id, mode, phase) VALUES (?, 'world_design', 'settle')",
        [emptyConvId],
      );

      const res = await jsonPost(app, `/api/conversations/${emptyConvId}/settle`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(json.ok).toBe(false);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('NO_CARD');
    });

    it('returns 404 for nonexistent conversation', async () => {
      const res = await jsonPost(app, '/api/conversations/nonexistent/settle');
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);
    });
  });

  // ─── POST /settle/confirm ───

  describe('POST /settle/confirm', () => {
    it('applies a draft settlement successfully (draft -> confirmed -> applied)', async () => {
      // Create draft
      const settleRes = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
      const settleJson = (await settleRes.json()) as Record<string, unknown>;
      const settleData = settleJson.data as Record<string, unknown>;
      const settlementId = settleData.id as string;

      (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        village_id: 'v-123',
        constitution_id: 'c-1',
        chief_id: 'ch-1',
        skills: [{ id: 's-1', name: 'deploy' }],
        applied: true,
      });

      // Confirm
      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      const data = json.data as Record<string, unknown>;
      expect(data.id).toBe(settlementId);
      expect(data.status).toBe('applied');

      // Verify DB state
      const row = db
        .query('SELECT * FROM settlements WHERE id = ?')
        .get(settlementId) as Record<string, unknown> | null;

      expect(row!.status).toBe('applied');
      expect(row!.thyra_response).not.toBeNull();
    });

    it('returns 404 when no draft exists', async () => {
      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('NO_DRAFT');
    });

    it('handles Thyra failure (draft -> confirmed -> failed)', async () => {
      // Create draft
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Thyra is down'),
      );

      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(502);
      expect(json.ok).toBe(false);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('UPSTREAM_ERROR');
      expect(err.message).toBe('Thyra is down');

      // Verify DB state is 'failed'
      const row = db
        .query('SELECT * FROM settlements WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(conversationId) as Record<string, unknown> | null;

      expect(row!.status).toBe('failed');
    });

    it('rejects double-confirm (already applied settlement has no draft)', async () => {
      // Create and confirm a draft
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        village_id: 'v-123',
        constitution_id: 'c-1',
        chief_id: 'ch-1',
        skills: [{ id: 's-1', name: 'deploy' }],
        applied: true,
      });
      await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);

      // Try to confirm again — no draft should exist
      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(json.ok).toBe(false);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('NO_DRAFT');
    });

    it('rejects confirm after failure (failed settlement has no draft)', async () => {
      // Create draft and let it fail
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('fail'),
      );
      await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);

      // Try to confirm again — no draft should exist
      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(404);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('NO_DRAFT');
    });
  });

  // ─── Status transition verification ───

  describe('Status transitions', () => {
    it('draft -> confirmed -> applied: DB state correct at each step', async () => {
      // Create draft
      const settleRes = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
      const settleJson = (await settleRes.json()) as Record<string, unknown>;
      const settleData = settleJson.data as Record<string, unknown>;
      const settlementId = settleData.id as string;

      // Check draft state
      const draftRow = db
        .query('SELECT status FROM settlements WHERE id = ?')
        .get(settlementId) as Record<string, unknown>;
      expect(draftRow.status).toBe('draft');

      // Confirm with success
      (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        village_id: 'v-456',
        constitution_id: 'c-2',
        chief_id: 'ch-2',
        skills: [{ id: 's-2', name: 'monitor' }],
        applied: true,
      });
      await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);

      // Check applied state
      const appliedRow = db
        .query('SELECT status, thyra_response FROM settlements WHERE id = ?')
        .get(settlementId) as Record<string, unknown>;
      expect(appliedRow.status).toBe('applied');
      expect(appliedRow.thyra_response).not.toBeNull();
    });

    it('draft -> confirmed -> failed: DB state correct at each step', async () => {
      // Create draft
      const settleRes = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
      const settleJson = (await settleRes.json()) as Record<string, unknown>;
      const settleData = settleJson.data as Record<string, unknown>;
      const settlementId = settleData.id as string;

      // Check draft state
      const draftRow = db
        .query('SELECT status FROM settlements WHERE id = ?')
        .get(settlementId) as Record<string, unknown>;
      expect(draftRow.status).toBe('draft');

      // Confirm with failure
      (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('timeout'),
      );
      await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);

      // Check failed state
      const failedRow = db
        .query('SELECT status, thyra_response FROM settlements WHERE id = ?')
        .get(settlementId) as Record<string, unknown>;
      expect(failedRow.status).toBe('failed');
      expect(failedRow.thyra_response).toBeNull();
    });
  });
});

// ─── Pipeline Settlement ───

describe('Pipeline settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();

    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    // Create conversation in settle phase with a pipeline card
    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'pipeline_design', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'pipeline', PIPELINE_CARD_CONTENT);
  });

  describe('POST /settle (pipeline)', () => {
    it('creates a draft settlement with YAML payload', async () => {
      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      const data = json.data as Record<string, unknown>;
      expect(data.status).toBe('draft');
      expect(data.target).toBe('pipeline');

      const payload = data.payload as string;
      expect(payload).toContain('Daily Report Pipeline');
      expect(payload).toContain('data-fetcher');
      expect(payload).toContain('Quality check');
    });

    it('stores draft in DB without calling Karvi', async () => {
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      const row = db
        .query('SELECT * FROM settlements WHERE conversation_id = ?')
        .get(conversationId) as Record<string, unknown> | null;

      expect(row).not.toBeNull();
      expect(row!.status).toBe('draft');
      expect(row!.target).toBe('pipeline');

      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock assertion
      expect(karvi.registerPipeline).not.toHaveBeenCalled();
    });
  });

  describe('POST /settle/confirm (pipeline)', () => {
    it('calls karvi.registerPipeline with correct shape', async () => {
      // Create draft
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      (karvi.registerPipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: 'Daily Report Pipeline',
        steps: [
          { order: 0, type: 'skill', label: 'Fetch data', skill_name: 'data-fetcher', instruction: 'Pull daily metrics' },
          { order: 1, type: 'gate', label: 'Quality check', skill_name: null, instruction: 'Verify data completeness' },
        ],
      });

      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      const data = json.data as Record<string, unknown>;
      expect(data.status).toBe('applied');

      // Verify Karvi was called with correct input
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock assertion
      expect(karvi.registerPipeline).toHaveBeenCalledTimes(1);
      const callArg = (karvi.registerPipeline as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.name).toBe('Daily Report Pipeline');
      const steps = callArg.steps as Array<Record<string, unknown>>;
      expect(steps).toHaveLength(2);
      expect(steps[0].label).toBe('Fetch data');
      expect(steps[0].skill_name).toBe('data-fetcher');
      expect(steps[1].label).toBe('Quality check');

      // Thyra should NOT have been called
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock assertion
      expect(thyra.applyVillagePack).not.toHaveBeenCalled();
    });

    it('handles Karvi failure (confirmed -> failed, 502)', async () => {
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      (karvi.registerPipeline as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Karvi is down'),
      );

      const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
      const json = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(502);
      expect(json.ok).toBe(false);

      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('UPSTREAM_ERROR');
      expect(err.message).toBe('Karvi is down');

      // DB status is 'failed'
      const row = db
        .query('SELECT status FROM settlements WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(conversationId) as Record<string, unknown>;
      expect(row.status).toBe('failed');
    });

    it('DB state is applied with thyra_response after success', async () => {
      await jsonPost(app, `/api/conversations/${conversationId}/settle`);

      (karvi.registerPipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        name: 'Daily Report Pipeline',
        steps: [],
      });

      await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);

      const row = db
        .query('SELECT status, thyra_response FROM settlements WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(conversationId) as Record<string, unknown>;

      expect(row.status).toBe('applied');
      expect(row.thyra_response).not.toBeNull();
    });
  });
});

// ─── Workflow Settlement ───

const WORKFLOW_CARD_CONTENT: WorkflowCard = {
  name: 'Deploy Flow',
  purpose: 'Automate deployment',
  steps: [
    { order: 0, description: 'Build', skill: 'builder', conditions: null },
    { order: 1, description: 'Test', skill: 'tester', conditions: 'build.success' },
  ],
  confirmed: {
    triggers: ['push to main'],
    exit_conditions: ['all tests pass'],
    failure_handling: ['rollback'],
  },
  pending: [],
  version: 1,
};

describe('Workflow settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();
    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'workflow_design', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'workflow', WORKFLOW_CARD_CONTENT);
  });

  it('creates draft with workflow target', async () => {
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.target).toBe('workflow');
    expect(data.status).toBe('draft');
    expect(data.payload).toContain('Deploy Flow');
  });

  it('confirm applies workflow settlement', async () => {
    await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.status).toBe('applied');

    const result = data.result as Record<string, unknown>;
    expect(result.applied).toBe(true);
    expect(result.target).toBe('workflow');
  });
});

// ─── Task Settlement ───

const TASK_CARD_CONTENT: TaskCard = {
  intent: 'Generate weekly report',
  inputs: { source: 'analytics_db', format: 'pdf' },
  constraints: ['under 5 pages', 'include graphs'],
  success_condition: 'PDF generated and sent',
  version: 1,
};

describe('Task settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();
    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'task', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'task', TASK_CARD_CONTENT);
  });

  it('creates draft with task target', async () => {
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.target).toBe('task');
    expect(data.status).toBe('draft');
    expect(data.payload).toContain('weekly report');
  });

  it('confirm applies task settlement', async () => {
    await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.status).toBe('applied');

    const result = data.result as Record<string, unknown>;
    expect(result.applied).toBe(true);
    expect(result.target).toBe('task');
  });
});

// ─── Adapter Settlement ───

const ADAPTER_CARD_CONTENT: AdapterCard = {
  platforms: [
    { platform: 'discord', enabled: true, role: 'community manager' },
    { platform: 'telegram', enabled: false, role: 'notifier' },
  ],
  version: 1,
};

describe('Adapter settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();
    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'adapter_config', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'adapter', ADAPTER_CARD_CONTENT);
  });

  it('creates draft with adapter_config target', async () => {
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.target).toBe('adapter_config');
    expect(data.status).toBe('draft');
    expect(data.payload).toContain('discord');
  });

  it('confirm applies adapter_config settlement', async () => {
    await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.status).toBe('applied');

    const result = data.result as Record<string, unknown>;
    expect(result.applied).toBe(true);
    expect(result.target).toBe('adapter_config');
  });

  it('returns no_settlement_target when no platform is enabled', async () => {
    const noEnabledConvId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'adapter_config', 'settle')",
      [noEnabledConvId],
    );
    const disabledAdapter: AdapterCard = {
      platforms: [
        { platform: 'discord', enabled: false, role: 'idle' },
      ],
      version: 1,
    };
    cardManager.create(noEnabledConvId, 'adapter', disabledAdapter);

    const res = await jsonPost(app, `/api/conversations/${noEnabledConvId}/settle`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.target).toBeNull();
    expect(data.status).toBe('no_settlement_target');
  });
});

// ─── Commerce Settlement ───

const COMMERCE_CARD_CONTENT: CommerceCard = {
  offerings: [
    {
      type: 'stall_slot',
      name: 'Basic Stall',
      description: 'A basic marketplace stall',
      base_price: 100,
      capacity: 10,
      duration: '30d',
    },
  ],
  pricing_rules: [
    { name: 'Early bird', condition: 'days_before > 7', adjustment_pct: -10 },
  ],
  pending: [],
  version: 1,
};

describe('Commerce settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();
    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'commerce_design', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'commerce', COMMERCE_CARD_CONTENT);
  });

  it('creates draft with market_init target', async () => {
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.target).toBe('market_init');
    expect(data.status).toBe('draft');
    expect(data.payload).toContain('Basic Stall');
  });

  it('confirm applies market_init settlement', async () => {
    await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.status).toBe('applied');

    const result = data.result as Record<string, unknown>;
    expect(result.applied).toBe(true);
    expect(result.target).toBe('market_init');
  });
});

// ─── Org Settlement ───

const ORG_CARD_CONTENT: OrgCard = {
  director: { name: 'Director Alpha', role: 'overseer', style: 'collaborative' },
  departments: [
    { name: 'Engineering', chief: 'Chief Eng', workers: ['dev1', 'dev2'], pipeline_refs: ['build-pipe'] },
  ],
  governance: {
    cycle: 'weekly',
    chief_order: ['Chief Eng'],
    escalation: 'Director Alpha',
  },
  pending: [],
  version: 1,
};

describe('Org settlement lifecycle', () => {
  let app: Hono;
  let db: Database;
  let cardManager: CardManager;
  let thyra: ReturnType<typeof createMockThyra>;
  let karvi: ReturnType<typeof createMockKarvi>;
  let conversationId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    cardManager = new CardManager(db);
    thyra = createMockThyra();
    karvi = createMockKarvi();
    app = new Hono();
    app.route('/', settlementRoutes({ db, cardManager, thyra, karvi }));

    conversationId = crypto.randomUUID();
    db.run(
      "INSERT INTO conversations (id, mode, phase) VALUES (?, 'org_design', 'settle')",
      [conversationId],
    );
    cardManager.create(conversationId, 'org', ORG_CARD_CONTENT);
  });

  it('creates draft with org_hierarchy target', async () => {
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.target).toBe('org_hierarchy');
    expect(data.status).toBe('draft');
    expect(data.payload).toContain('Engineering');
  });

  it('confirm applies org_hierarchy settlement', async () => {
    await jsonPost(app, `/api/conversations/${conversationId}/settle`);
    const res = await jsonPost(app, `/api/conversations/${conversationId}/settle/confirm`);
    const json = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.status).toBe('applied');

    const result = data.result as Record<string, unknown>;
    expect(result.applied).toBe(true);
    expect(result.target).toBe('org_hierarchy');
  });
});
