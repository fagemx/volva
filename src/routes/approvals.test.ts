import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { approvalRoutes } from './approvals';
import type { ApprovalDeps } from './approvals';
import type { SkillObject } from '../schemas/skill-object';
import type { SkillObjectLookup } from '../skills/types';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { KarviClient } from '../karvi-client/client';
import { KarviApiError } from '../karvi-client/schemas';

// ─── Helpers ───

function makeSkillObject(overrides?: Partial<SkillObject>): SkillObject {
  return {
    kind: 'SkillObject',
    apiVersion: '1.0.0',
    id: 'skill.deploy-service',
    name: 'deploy-service',
    version: '1.2.0',
    status: 'promoted',
    identity: {
      summary: 'Deploy a service',
      owners: { human: ['dev'], agent: ['volva'] },
      domain: 'ops',
      tags: ['deploy'],
      maturity: 'stable',
      riskTier: 'medium',
    },
    purpose: {
      problemShapes: ['deploy'],
      desiredOutcomes: ['deployed'],
      nonGoals: [],
      notFor: [],
    },
    routing: {
      description: 'Deploy service',
      triggerWhen: ['deploy'],
      doNotTriggerWhen: [],
      priority: 50,
      conflictsWith: [],
      mayChainTo: [],
    },
    contract: {
      inputs: { required: [], optional: [] },
      outputs: { primary: [], secondary: [] },
      successCriteria: [],
      failureModes: [],
    },
    package: {
      root: '/skills/deploy',
      entryFile: 'SKILL.md',
      references: [],
      scripts: [],
      assets: [],
      config: { schemaFile: '', dataFile: '' },
      hooks: [],
      localState: { enabled: false, stablePath: '', files: [] },
    },
    environment: {
      toolsRequired: ['git', 'docker'],
      toolsOptional: ['kubectl'],
      permissions: {
        filesystem: { read: true, write: true },
        network: { read: true, write: true },
        process: { spawn: true },
        secrets: { read: ['DEPLOY_KEY'] },
      },
      externalSideEffects: true,
      executionMode: 'destructive',
    },
    dispatch: {
      mode: 'karvi',
      fallback: 'local',
      targetSelection: { repoPolicy: 'explicit', runtimeOptions: ['claude'] },
      workerClass: ['implementation'],
      handoff: { inputArtifacts: [], outputArtifacts: ['deploy_url'] },
      executionPolicy: { sync: false, retries: 1, timeoutMinutes: 20, escalationOnFailure: true },
      approval: { requireHumanBeforeDispatch: true, requireHumanBeforeMerge: true },
    },
    verification: {
      smokeChecks: ['staging-smoke-pass'],
      assertions: [],
      humanCheckpoints: [],
      outcomeSignals: ['deploy_url_reachable'],
    },
    memory: {
      localMemoryPolicy: { canStore: [], cannotStore: [] },
      precedentWriteback: { enabled: false, target: '', when: [] },
    },
    governance: {
      mutability: {
        agentMayEdit: [],
        agentMayPropose: [],
        humanApprovalRequired: [],
        forbiddenWithoutHuman: [],
      },
      reviewPolicy: { requiredReviewers: [] },
      promotionGates: [],
      rollbackPolicy: { allowed: false, rollbackOn: [] },
      supersession: { supersedes: [], supersededBy: null },
    },
    ...overrides,
  };
}

function makeLookup(skillObj: SkillObject | null): SkillObjectLookup {
  return {
    getSkillObject: () => skillObj,
  };
}

function makeMockKarviClient(): KarviClient & {
  dispatchSkill: ReturnType<typeof vi.fn>;
  getDispatchStatus: ReturnType<typeof vi.fn>;
} {
  return {
    dispatchSkill: vi.fn(),
    getDispatchStatus: vi.fn(),
    getHealth: vi.fn().mockResolvedValue({ ok: true }),
    cancelDispatch: vi.fn(),
    registerPipeline: vi.fn(),
    listPipelines: vi.fn(),
    deletePipeline: vi.fn(),
    forgeBuild: vi.fn(),
  } as unknown as KarviClient & {
    dispatchSkill: ReturnType<typeof vi.fn>;
    getDispatchStatus: ReturnType<typeof vi.fn>;
  };
}

function createTestApp(db: Database, skillObj: SkillObject | null, client: ReturnType<typeof makeMockKarviClient>) {
  const app = new Hono();
  const deps: ApprovalDeps = {
    db,
    skillObjectLookup: makeLookup(skillObj),
    karviClient: client as unknown as KarviClient,
    readSkillContent: () => '# SKILL.md content',
  };
  app.route('/', approvalRoutes(deps));
  return app;
}

async function jsonPost(app: Hono, path: string, body: Record<string, unknown> = {}) {
  return app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ───

describe('approvalRoutes', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  describe('POST /api/dispatches', () => {
    it('returns dispatched when no approval required', async () => {
      const client = makeMockKarviClient();
      // Insert skill instance for telemetry
      db.prepare(
        'INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count) VALUES (?, ?, ?, ?, 0, 0)',
      ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

      client.dispatchSkill.mockResolvedValueOnce({ dispatchId: 'disp-001', status: 'pending' });
      client.getDispatchStatus.mockResolvedValueOnce({
        id: 'disp-001',
        status: 'completed',
        type: 'skill',
        createdAt: '2026-03-19T00:00:00Z',
        updatedAt: '2026-03-19T00:01:00Z',
        result: {
          skillId: 'skill.deploy-service',
          status: 'success',
          durationMs: 5000,
          steps: [],
          outputs: { deploy_url: 'https://staging.example.com' },
          verification: { smokeChecksPassed: true, failedChecks: [] },
          telemetry: { tokensUsed: 1000, costUsd: 0.05, runtime: 'claude', model: 'claude-sonnet-4-5-20250514', stepsExecuted: 1 },
        },
      });

      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches', {
        skillId: 'skill.deploy-service',
        userMessage: 'Deploy checkout-service',
        inputs: {},
      });

      expect(res.status).toBe(202);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.type).toBe('dispatched');
    });

    it('returns approval_required with presentation when approval needed', async () => {
      const client = makeMockKarviClient();
      client.dispatchSkill.mockRejectedValueOnce(
        new KarviApiError('APPROVAL_REQUIRED', 'Human approval needed', { pendingApprovalId: 'appr_abc123' }),
      );

      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches', {
        skillId: 'skill.deploy-service',
        userMessage: 'Deploy checkout-service',
        inputs: {},
      });

      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.type).toBe('approval_required');
      expect(data.pendingId).toBe('appr_abc123');
      expect(data.expiresAt).toBeDefined();

      // Check presentation fields
      const presentation = data.presentation as Record<string, unknown>;
      expect(presentation.skillName).toBe('deploy-service');
      expect(presentation.skillVersion).toBe('1.2.0');
      expect(presentation.executionMode).toBe('destructive');
      expect(presentation.externalSideEffects).toBe(true);
      expect(presentation.estimatedTimeout).toBe('20 minutes');
      expect(presentation.permissions).toBeDefined();

      // Check audit row was created
      const audit = db.prepare("SELECT * FROM approval_audits WHERE pending_id = 'appr_abc123'")
        .get() as Record<string, unknown> | null;
      expect(audit).not.toBeNull();
      expect(audit?.decision).toBe('pending');
      expect(audit?.skill_name).toBe('deploy-service');
      expect(audit?.execution_mode).toBe('destructive');
    });

    it('returns fallback_local when skill not found', async () => {
      const client = makeMockKarviClient();
      const app = createTestApp(db, null, client);

      const res = await jsonPost(app, '/api/dispatches', {
        skillId: 'skill.nonexistent',
        userMessage: 'Do something',
        inputs: {},
      });

      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      const data = json.data as Record<string, unknown>;
      expect(data.type).toBe('fallback_local');
    });

    it('rejects invalid input', async () => {
      const client = makeMockKarviClient();
      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches', { userMessage: 'test' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/dispatches/approve', () => {
    it('re-submits with approval token on approve within TTL', async () => {
      const client = makeMockKarviClient();

      // Insert skill instance for telemetry
      db.prepare(
        'INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count) VALUES (?, ?, ?, ?, 0, 0)',
      ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

      // Insert a pending audit row
      db.run(
        `INSERT INTO approval_audits
         (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          'audit_001',
          'appr_abc123',
          'skill.deploy-service',
          'deploy-service',
          'destructive',
          '{}',
          1,
          JSON.stringify({
            skillId: 'skill.deploy-service',
            userMessage: 'Deploy checkout-service',
            inputs: {},
          }),
        ],
      );

      // Mock successful resubmit
      client.dispatchSkill.mockResolvedValueOnce({ dispatchId: 'disp-002', status: 'pending' });
      client.getDispatchStatus.mockResolvedValueOnce({
        id: 'disp-002',
        status: 'completed',
        type: 'skill',
        createdAt: '2026-03-19T00:00:00Z',
        updatedAt: '2026-03-19T00:01:00Z',
        result: {
          skillId: 'skill.deploy-service',
          status: 'success',
          durationMs: 4000,
          steps: [],
          outputs: {},
          verification: { smokeChecksPassed: true, failedChecks: [] },
          telemetry: { tokensUsed: 800, costUsd: 0.03, runtime: 'claude', model: 'claude-sonnet-4-5-20250514', stepsExecuted: 1 },
        },
      });

      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches/approve', {
        pendingId: 'appr_abc123',
        approvedBy: 'alice',
      });

      expect(res.status).toBe(202);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.type).toBe('dispatched');

      // Verify approval token was sent
      const sentRequest = client.dispatchSkill.mock.calls[0][0] as Record<string, unknown>;
      const token = sentRequest.approvalToken as Record<string, unknown>;
      expect(token.pendingId).toBe('appr_abc123');
      expect(token.approvedBy).toBe('alice');

      // Verify audit updated
      const audit = db.prepare('SELECT * FROM approval_audits WHERE id = ?')
        .get('audit_001') as Record<string, unknown>;
      expect(audit.decision).toBe('approved');
      expect(audit.decided_by).toBe('alice');
    });

    it('returns error when TTL expired', async () => {
      const client = makeMockKarviClient();

      // Insert a pending audit row with old created_at (31 min ago)
      const oldTime = new Date(Date.now() - 31 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
      db.run(
        `INSERT INTO approval_audits
         (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          'audit_002',
          'appr_expired',
          'skill.deploy-service',
          'deploy-service',
          'destructive',
          '{}',
          1,
          '{}',
          oldTime,
        ],
      );

      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches/approve', {
        pendingId: 'appr_expired',
      });

      expect(res.status).toBe(410);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(false);
      const err = json.error as Record<string, unknown>;
      expect(err.code).toBe('APPROVAL_EXPIRED');

      // Verify audit updated to expired
      const audit = db.prepare('SELECT * FROM approval_audits WHERE id = ?')
        .get('audit_002') as Record<string, unknown>;
      expect(audit.decision).toBe('expired');
    });

    it('returns 404 for unknown pendingId', async () => {
      const client = makeMockKarviClient();
      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches/approve', {
        pendingId: 'appr_nonexistent',
      });

      expect(res.status).toBe(404);
    });

    it('defaults approvedBy to human when not provided', async () => {
      const client = makeMockKarviClient();

      db.prepare(
        'INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count) VALUES (?, ?, ?, ?, 0, 0)',
      ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

      db.run(
        `INSERT INTO approval_audits
         (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          'audit_003',
          'appr_default',
          'skill.deploy-service',
          'deploy-service',
          'active',
          '{}',
          0,
          JSON.stringify({ skillId: 'skill.deploy-service', userMessage: 'test', inputs: {} }),
        ],
      );

      client.dispatchSkill.mockResolvedValueOnce({ dispatchId: 'disp-003', status: 'pending' });
      client.getDispatchStatus.mockResolvedValueOnce({
        id: 'disp-003',
        status: 'completed',
        type: 'skill',
        createdAt: '2026-03-19T00:00:00Z',
        updatedAt: '2026-03-19T00:01:00Z',
        result: {
          skillId: 'skill.deploy-service',
          status: 'success',
          durationMs: 1000,
          steps: [],
          outputs: {},
          verification: { smokeChecksPassed: true, failedChecks: [] },
          telemetry: { tokensUsed: 100, costUsd: 0.01, runtime: 'claude', model: 'claude-sonnet-4-5-20250514', stepsExecuted: 0 },
        },
      });

      const app = createTestApp(db, makeSkillObject(), client);

      await jsonPost(app, '/api/dispatches/approve', { pendingId: 'appr_default' });

      const sentRequest = client.dispatchSkill.mock.calls[0][0] as Record<string, unknown>;
      const token = sentRequest.approvalToken as Record<string, unknown>;
      expect(token.approvedBy).toBe('human');
    });
  });

  describe('POST /api/dispatches/deny', () => {
    it('records denial and returns success', async () => {
      const client = makeMockKarviClient();

      db.run(
        `INSERT INTO approval_audits
         (id, pending_id, skill_id, skill_name, execution_mode, permissions_json, external_side_effects, dispatch_context_json, decision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          'audit_004',
          'appr_deny_me',
          'skill.deploy-service',
          'deploy-service',
          'destructive',
          '{}',
          1,
          '{}',
        ],
      );

      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches/deny', {
        pendingId: 'appr_deny_me',
      });

      expect(res.status).toBe(200);
      const json = await res.json() as Record<string, unknown>;
      expect(json.ok).toBe(true);
      const data = json.data as Record<string, unknown>;
      expect(data.denied).toBe(true);
      expect(data.pendingId).toBe('appr_deny_me');

      // Verify audit updated
      const audit = db.prepare('SELECT * FROM approval_audits WHERE id = ?')
        .get('audit_004') as Record<string, unknown>;
      expect(audit.decision).toBe('denied');
      expect(audit.decided_at).toBeDefined();

      // Verify no dispatch was made
      expect(client.dispatchSkill).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown pendingId', async () => {
      const client = makeMockKarviClient();
      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches/deny', {
        pendingId: 'appr_nonexistent',
      });

      expect(res.status).toBe(404);
    });

    it('rejects invalid input', async () => {
      const client = makeMockKarviClient();
      const app = createTestApp(db, makeSkillObject(), client);

      const res = await jsonPost(app, '/api/dispatches/deny', {});
      expect(res.status).toBe(400);
    });
  });
});
