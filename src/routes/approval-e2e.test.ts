import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { KarviClient } from '../karvi-client/client';
import { KarviApiError } from '../karvi-client/schemas';
import { dispatchToKarvi, resubmitWithApproval } from './skill-dispatcher';
import type { SkillDispatchContext, DispatchDeps } from './skill-dispatcher';
import type { SkillObject } from '../schemas/skill-object';
import type { SkillObjectLookup } from '../skills/types';

// ─── Stateful Mock Karvi Server ───

const APPROVAL_TTL_MS = 30 * 60 * 1000; // 30 minutes (R2)

interface ApprovalMockState {
  pendingApprovals: Map<string, { createdAt: number }>;
  dispatchCounter: number;
  getNow: () => number;
}

function createApprovalMockFetch(state: ApprovalMockState) {
  return ((url: string, init?: RequestInit): Response => {
    const urlStr = url;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) as Record<string, unknown> : null;

    // POST /api/volva/dispatch-skill
    if (method === 'POST' && urlStr.endsWith('/api/volva/dispatch-skill')) {
      const dispatch = body?.dispatch as Record<string, unknown> | undefined;
      const approval = dispatch?.approval as Record<string, unknown> | undefined;
      const requireApproval = approval?.requireHumanBeforeDispatch === true;
      const approvalToken = body?.approvalToken as { pendingId: string } | undefined;

      // If approval is required and no token provided -> APPROVAL_REQUIRED (R1)
      if (requireApproval && !approvalToken) {
        const pendingId = `appr_${String(++state.dispatchCounter).padStart(6, '0')}`;
        state.pendingApprovals.set(pendingId, { createdAt: state.getNow() });
        return new Response(JSON.stringify({
          ok: false,
          error: { code: 'APPROVAL_REQUIRED', message: pendingId },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // If approval token provided -> validate it
      if (approvalToken) {
        const pending = state.pendingApprovals.get(approvalToken.pendingId);

        // Token not found (already consumed or never existed) -> APPROVAL_INVALID (R3)
        if (!pending) {
          return new Response(JSON.stringify({
            ok: false,
            error: { code: 'APPROVAL_INVALID', message: 'token is invalid or expired' },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Token expired -> APPROVAL_INVALID (R2)
        if (state.getNow() - pending.createdAt > APPROVAL_TTL_MS) {
          state.pendingApprovals.delete(approvalToken.pendingId);
          return new Response(JSON.stringify({
            ok: false,
            error: { code: 'APPROVAL_INVALID', message: 'token is invalid or expired' },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Token valid -> consume (R3) and proceed
        state.pendingApprovals.delete(approvalToken.pendingId);
      }

      // Dispatch succeeds
      const dispatchId = `disp_${String(++state.dispatchCounter).padStart(6, '0')}`;
      return new Response(JSON.stringify({
        ok: true,
        data: { dispatchId, status: 'queued' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // GET /api/volva/status/:id -> return completed
    if (method === 'GET' && urlStr.includes('/api/volva/status/')) {
      const id = urlStr.split('/api/volva/status/')[1];
      return new Response(JSON.stringify({
        ok: true,
        data: {
          id,
          status: 'completed',
          type: 'skill',
          createdAt: '2026-03-19T00:00:00Z',
          updatedAt: '2026-03-19T00:01:00Z',
          result: {
            skillId: 'skill.deploy-service',
            status: 'success',
            durationMs: 5000,
            steps: [{ stepId: 'plan', type: 'plan', status: 'success', artifacts: [] }],
            outputs: { deploy_url: 'https://staging.example.com' },
            verification: { smokeChecksPassed: true, failedChecks: [] },
            telemetry: { tokensUsed: 1000, costUsd: 0.05, runtime: 'claude', model: 'claude-sonnet-4-5-20250514', stepsExecuted: 1 },
          },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // GET /api/health -> return healthy
    if (method === 'GET' && urlStr.endsWith('/api/health')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }) as unknown as typeof fetch;
}

// ─── Fixtures ───

function makeSkillObject(overrides?: { requireHumanBeforeDispatch?: boolean }): SkillObject {
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
      executionMode: 'active',
    },
    dispatch: {
      mode: 'karvi',
      fallback: 'local',
      targetSelection: { repoPolicy: 'explicit', runtimeOptions: ['claude'] },
      workerClass: ['implementation'],
      handoff: { inputArtifacts: [], outputArtifacts: ['deploy_url'] },
      executionPolicy: { sync: false, retries: 1, timeoutMinutes: 20, escalationOnFailure: true },
      approval: {
        requireHumanBeforeDispatch: overrides?.requireHumanBeforeDispatch ?? true,
        requireHumanBeforeMerge: true,
      },
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
  };
}

function makeContext(): SkillDispatchContext {
  return {
    skillId: 'skill.deploy-service',
    conversationId: 'conv_123',
    userMessage: 'Deploy checkout-service to staging',
    workingDir: '/repos/checkout-service',
    inputs: { service_name: 'checkout-service' },
  };
}

function makeLookup(skillObj: SkillObject): SkillObjectLookup {
  return { getSkillObject: () => skillObj };
}

function seedSkillInstance(db: Database): void {
  db.prepare(
    `INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count)
     VALUES (?, ?, ?, ?, 0, 0)`,
  ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');
}

// ─── Approval Gate Round-Trip Tests ───

describe('Approval gate round-trip (R1, R2, R3)', () => {
  let db: Database;
  let mockState: ApprovalMockState;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    seedSkillInstance(db);

    mockState = {
      pendingApprovals: new Map(),
      dispatchCounter: 0,
      getNow: () => Date.now(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Test 1: happy path - request -> APPROVAL_REQUIRED -> re-submit -> dispatch succeeds', async () => {
    const skillObj = makeSkillObject({ requireHumanBeforeDispatch: true });
    const client = new KarviClient({
      retries: 0,
      fetchFn: createApprovalMockFetch(mockState),
    });
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(skillObj),
      karviClient: client,
      db,
      readSkillContent: () => '# Deploy SKILL.md',
    };

    // Step 1: First dispatch -> APPROVAL_REQUIRED
    const firstResult = await dispatchToKarvi(makeContext(), deps);
    expect(firstResult.type).toBe('approval_required');
    if (firstResult.type !== 'approval_required') return;

    expect(firstResult.pendingId).toMatch(/^appr_/);
    expect(firstResult.skillName).toBe('deploy-service');
    expect(firstResult.sideEffects).toBe(true);
    expect(firstResult.permissions.filesystem.write).toBe(true);

    // Step 2: Re-submit with approval token -> dispatch succeeds
    const token = {
      pendingId: firstResult.pendingId,
      approvedBy: 'alice',
      approvedAt: '2026-03-19T00:00:00Z',
    };

    const secondResult = await resubmitWithApproval(makeContext(), token, deps);
    expect(secondResult.type).toBe('dispatched');
    if (secondResult.type !== 'dispatched') return;

    expect(secondResult.result.status).toBe('success');
    expect(secondResult.result.outputs.deploy_url).toBe('https://staging.example.com');

    // Verify telemetry was recorded
    const runs = db.prepare('SELECT * FROM skill_runs WHERE skill_instance_id = ?')
      .all('skill.deploy-service') as Array<Record<string, unknown>>;
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe('success');
  });

  it('Test 2: token one-time use (R3) - second use of same token rejected', async () => {
    const skillObj = makeSkillObject({ requireHumanBeforeDispatch: true });
    const client = new KarviClient({
      retries: 0,
      fetchFn: createApprovalMockFetch(mockState),
    });
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(skillObj),
      karviClient: client,
      db,
      readSkillContent: () => '# Deploy SKILL.md',
    };

    // Step 1: Get APPROVAL_REQUIRED
    const firstResult = await dispatchToKarvi(makeContext(), deps);
    expect(firstResult.type).toBe('approval_required');
    if (firstResult.type !== 'approval_required') return;

    const token = {
      pendingId: firstResult.pendingId,
      approvedBy: 'alice',
      approvedAt: '2026-03-19T00:00:00Z',
    };

    // Step 2: First resubmit succeeds
    const secondResult = await resubmitWithApproval(makeContext(), token, deps);
    expect(secondResult.type).toBe('dispatched');

    // Step 3: Second resubmit with same token -> APPROVAL_INVALID
    await expect(resubmitWithApproval(makeContext(), token, deps))
      .rejects.toBeInstanceOf(KarviApiError);

    try {
      await resubmitWithApproval(makeContext(), token, deps);
    } catch (error) {
      expect(error).toBeInstanceOf(KarviApiError);
      const apiError = error as InstanceType<typeof KarviApiError>;
      expect(apiError.code).toBe('APPROVAL_INVALID');
      expect(apiError.message).toBe('token is invalid or expired');
    }
  });

  it('Test 3: token TTL expiry (R2) - expired token rejected', async () => {
    let now = Date.now();
    mockState.getNow = () => now;

    const skillObj = makeSkillObject({ requireHumanBeforeDispatch: true });
    const client = new KarviClient({
      retries: 0,
      fetchFn: createApprovalMockFetch(mockState),
    });
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(skillObj),
      karviClient: client,
      db,
      readSkillContent: () => '# Deploy SKILL.md',
    };

    // Step 1: Get APPROVAL_REQUIRED
    const firstResult = await dispatchToKarvi(makeContext(), deps);
    expect(firstResult.type).toBe('approval_required');
    if (firstResult.type !== 'approval_required') return;

    // Step 2: Simulate 31 minutes passing
    now += 31 * 60 * 1000;

    const token = {
      pendingId: firstResult.pendingId,
      approvedBy: 'alice',
      approvedAt: new Date(now).toISOString(),
    };

    // Step 3: Re-submit with expired token -> APPROVAL_INVALID
    await expect(resubmitWithApproval(makeContext(), token, deps))
      .rejects.toBeInstanceOf(KarviApiError);

    try {
      // Re-create client for the retry (since the previous call already threw)
      const retryClient = new KarviClient({
        retries: 0,
        fetchFn: createApprovalMockFetch(mockState),
      });
      const retryDeps: DispatchDeps = { ...deps, karviClient: retryClient };
      await resubmitWithApproval(makeContext(), token, retryDeps);
    } catch (error) {
      expect(error).toBeInstanceOf(KarviApiError);
      const apiError = error as InstanceType<typeof KarviApiError>;
      expect(apiError.code).toBe('APPROVAL_INVALID');
      expect(apiError.message).toBe('token is invalid or expired');
    }
  });

  it('Test 4: approval not required - dispatch proceeds immediately', async () => {
    const skillObj = makeSkillObject({ requireHumanBeforeDispatch: false });
    const client = new KarviClient({
      retries: 0,
      fetchFn: createApprovalMockFetch(mockState),
    });
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(skillObj),
      karviClient: client,
      db,
      readSkillContent: () => '# Deploy SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('dispatched');
    if (result.type !== 'dispatched') return;

    expect(result.result.status).toBe('success');
    expect(result.result.outputs.deploy_url).toBe('https://staging.example.com');

    // Verify no approval gate was triggered
    expect(mockState.pendingApprovals.size).toBe(0);
  });
});
