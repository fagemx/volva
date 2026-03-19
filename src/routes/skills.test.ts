import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createDb, initSchema } from '../db';
import { SkillRegistry } from '../skills/registry';
import { skillRoutes } from './skills';
import type { Database } from 'bun:sqlite';
import type { LLMClient } from '../llm/client';
import type { SkillObject } from '../schemas/skill-object';

// ─── Helpers ───

function createMockLLM(): LLMClient & { generateStructured: ReturnType<typeof vi.fn> } {
  return {
    generateStructured: vi.fn(),
    generateText: vi.fn(),
  } as unknown as LLMClient & { generateStructured: ReturnType<typeof vi.fn> };
}

function makeMinimalSkillObject(overrides?: Partial<SkillObject>): SkillObject {
  return {
    kind: 'SkillObject',
    apiVersion: 'volva.ai/v0',
    id: 'skill.test-skill',
    name: 'Test Skill',
    version: '0.1.0',
    status: 'sandbox',
    identity: {
      summary: 'A test skill',
      owners: { human: [], agent: [] },
      domain: 'testing',
      tags: ['test'],
      maturity: 'emerging',
      riskTier: 'low',
    },
    purpose: {
      problemShapes: ['test problems'],
      desiredOutcomes: ['tested code'],
      nonGoals: ['production deploys'],
      notFor: [],
    },
    routing: {
      description: 'A test skill',
      triggerWhen: ['run tests', 'test suite'],
      doNotTriggerWhen: ['deploy'],
      priority: 50,
      conflictsWith: [],
      mayChainTo: [],
    },
    contract: {
      inputs: { required: [], optional: [] },
      outputs: { primary: [], secondary: [] },
      successCriteria: ['tests pass'],
      failureModes: [],
    },
    package: {
      root: 'skills/test-skill/',
      entryFile: 'SKILL.md',
      references: [],
      scripts: [],
      assets: [],
      config: { schemaFile: 'config.schema.json', dataFile: 'config.json' },
      hooks: [],
      localState: { enabled: true, stablePath: '${SKILL_DATA}/test-skill/', files: [] },
    },
    environment: {
      toolsRequired: [],
      toolsOptional: [],
      permissions: {
        filesystem: { read: true, write: false },
        network: { read: false, write: false },
        process: { spawn: false },
        secrets: { read: [] },
      },
      externalSideEffects: false,
      executionMode: 'advisory',
    },
    dispatch: {
      mode: 'local',
      targetSelection: { repoPolicy: 'explicit', runtimeOptions: [] },
      workerClass: [],
      handoff: { inputArtifacts: [], outputArtifacts: [] },
      executionPolicy: { sync: false, retries: 1, timeoutMinutes: 30, escalationOnFailure: true },
      approval: { requireHumanBeforeDispatch: false, requireHumanBeforeMerge: true },
    },
    verification: {
      smokeChecks: ['run unit tests'],
      assertions: [],
      humanCheckpoints: [],
      outcomeSignals: [],
    },
    memory: {
      localMemoryPolicy: { canStore: [], cannotStore: ['secrets'] },
      precedentWriteback: { enabled: true, target: 'edda', when: [] },
    },
    governance: {
      mutability: { agentMayEdit: [], agentMayPropose: [], humanApprovalRequired: [], forbiddenWithoutHuman: [] },
      reviewPolicy: { requiredReviewers: ['owner'] },
      promotionGates: [],
      rollbackPolicy: { allowed: true, rollbackOn: [] },
      supersession: { supersedes: [], supersededBy: null },
    },
    telemetry: {
      track: [{ metric: 'run_count' }],
      thresholds: { promotion_min_success: 3, retirement_idle_days: 90 },
      reporting: { target: 'edda', frequency: 'on_governance' },
    },
    lifecycle: {
      createdFrom: [],
      currentStage: 'capture',
      promotionPath: ['draft', 'sandbox', 'promoted', 'core'],
      retirementCriteria: [],
      lastReviewedAt: null,
    },
    ...overrides,
  };
}

function createTestApp(db: Database): { app: Hono; registry: SkillRegistry; llm: LLMClient & { generateStructured: ReturnType<typeof vi.fn> } } {
  const llm = createMockLLM();
  const registry = new SkillRegistry();
  const app = new Hono();
  app.route('/', skillRoutes({ db, llm, registry }));
  return { app, registry, llm };
}

async function jsonPost(app: Hono, path: string, body: Record<string, unknown> = {}) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function jsonGet(app: Hono, path: string) {
  return app.request(path, { method: 'GET' });
}

// ─── Tests ───

describe('skillRoutes', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  describe('GET /api/skills', () => {
    it('returns empty list when no skills registered', async () => {
      const { app } = createTestApp(db);
      const res = await jsonGet(app, '/api/skills');
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.skills).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('rejects invalid status filter', async () => {
      const { app } = createTestApp(db);
      const res = await jsonGet(app, '/api/skills?status=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/skills/:id', () => {
    it('returns 404 for unknown skill', async () => {
      const { app } = createTestApp(db);
      const res = await jsonGet(app, '/api/skills/skill.nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/skills/:id/run', () => {
    it('returns 404 for unknown skill', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/skill.nonexistent/run', {
        outcome: 'success',
      });
      expect(res.status).toBe(404);
    });

    it('rejects invalid outcome', async () => {
      const { app, registry } = createTestApp(db);
      // Manually inject a skill into the registry
      const skillObj = makeMinimalSkillObject();
      (registry as unknown as Record<string, unknown>)['index'] = new Map([
        ['skill.test-skill', {
          id: 'skill.test-skill',
          name: 'Test Skill',
          status: 'sandbox',
          priority: 50,
          filePath: '/fake/path',
          triggerWhen: ['run tests'],
          doNotTriggerWhen: ['deploy'],
          skillObject: skillObj,
        }],
      ]);

      const res = await jsonPost(app, '/api/skills/skill.test-skill/run', {
        outcome: 'invalid',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/skills/:id/promotion', () => {
    it('returns 404 for unknown skill', async () => {
      const { app } = createTestApp(db);
      const res = await jsonGet(app, '/api/skills/skill.nonexistent/promotion');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/skills/match', () => {
    it('requires context', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/match', {});
      expect(res.status).toBe(400);
    });

    it('returns empty matches when no skills registered', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/match', { context: 'run tests' });
      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      expect(data.matches).toEqual([]);
    });
  });

  describe('POST /api/skills/harvest', () => {
    it('requires context', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/harvest', { history: [{ role: 'user', content: 'hi' }] });
      expect(res.status).toBe(400);
    });

    it('requires non-empty history', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/harvest', { context: 'test', history: [] });
      expect(res.status).toBe(400);
    });

    it('returns candidate with awaitConfirmation (SETTLE-01)', async () => {
      const { app, llm } = createTestApp(db);

      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: {
          name: 'Test Pattern',
          summary: 'A test pattern',
          problemShapes: ['testing'],
          desiredOutcomes: ['tested'],
          nonGoals: [],
          triggerWhen: ['test'],
          doNotTriggerWhen: [],
          methodOutline: ['step 1'],
          observedGotchas: [],
        },
      });

      const res = await jsonPost(app, '/api/skills/harvest', {
        context: 'test context',
        history: [{ role: 'user', content: 'do some testing' }],
      });

      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.awaitConfirmation).toBe(true);
      expect(data.candidate).toBeDefined();
    });
  });

  describe('POST /api/skills/crystallize', () => {
    it('requires confirmation (SETTLE-01)', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/crystallize', {
        candidate: { name: 'test', summary: 'test' },
      });
      expect(res.status).toBe(400);
      const json = await res.json() as Record<string, unknown>;
      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('crystallizes candidate with confirmation', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/crystallize', {
        confirmation: true,
        candidate: {
          name: 'Test Pattern',
          summary: 'A test pattern for testing',
          problemShapes: ['testing'],
          desiredOutcomes: ['tested code'],
          nonGoals: [],
          triggerWhen: ['run tests'],
          doNotTriggerWhen: ['deploy'],
          methodOutline: ['step 1'],
          observedGotchas: [],
        },
      });

      expect(res.status).toBe(201);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.skillObject).toBeDefined();
      expect(data.yaml).toBeDefined();
      expect(data.skillMd).toBeDefined();
    });

    it('rejects missing candidate', async () => {
      const { app } = createTestApp(db);
      const res = await jsonPost(app, '/api/skills/crystallize', {
        confirmation: true,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('harvest → crystallize 2-step flow (SETTLE-01)', () => {
    it('completes the full 2-step flow', async () => {
      const { app, llm } = createTestApp(db);

      // Step 1: Harvest returns candidate for review
      llm.generateStructured.mockResolvedValueOnce({
        ok: true,
        data: {
          name: 'Deploy Flow',
          summary: 'Standardized deploy pattern',
          problemShapes: ['deployment'],
          desiredOutcomes: ['deployed'],
          nonGoals: [],
          triggerWhen: ['deploy'],
          doNotTriggerWhen: ['rollback'],
          methodOutline: ['build', 'test', 'deploy'],
          observedGotchas: ['check ports'],
        },
      });

      const harvestRes = await jsonPost(app, '/api/skills/harvest', {
        context: 'deploy flow context',
        history: [
          { role: 'user', content: 'deploy the service' },
          { role: 'assistant', content: 'deploying...' },
        ],
      });

      expect(harvestRes.status).toBe(200);
      const harvestJson = await harvestRes.json() as Record<string, unknown>;
      const harvestData = harvestJson.data as Record<string, unknown>;
      expect(harvestData.awaitConfirmation).toBe(true);

      // Step 2: User reviews and confirms crystallization
      const candidate = harvestData.candidate;
      const crystallizeRes = await jsonPost(app, '/api/skills/crystallize', {
        confirmation: true,
        candidate,
      });

      expect(crystallizeRes.status).toBe(201);
      const crystallizeJson = await crystallizeRes.json() as Record<string, unknown>;
      expect(crystallizeJson.ok).toBe(true);
      const crystallizeData = crystallizeJson.data as Record<string, unknown>;
      const skillObject = crystallizeData.skillObject as Record<string, unknown>;
      expect(skillObject.name).toBe('Deploy Flow');
      expect(skillObject.status).toBe('draft');
    });
  });
});
