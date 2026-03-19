import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDispatchRequest, dispatchToKarvi, resubmitWithApproval } from './skill-dispatcher';
import type { SkillDispatchContext, DispatchDeps } from './skill-dispatcher';
import type { SkillObject } from '../schemas/skill-object';
import type { SkillObjectLookup } from '../skills/types';
import { KarviClient } from '../karvi-client/client';
import { KarviNetworkError, KarviApiError } from '../karvi-client/schemas';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';

// ─── Fixtures ───

function makeSkillObject(overrides?: { mode?: 'local' | 'karvi' | 'hybrid'; fallback?: 'local' | 'queue' | 'reject' }): SkillObject {
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
      mode: overrides?.mode ?? 'karvi',
      fallback: overrides?.fallback ?? 'local',
      targetSelection: { repoPolicy: 'explicit', runtimeOptions: ['claude'] },
      workerClass: ['implementation'],
      handoff: { inputArtifacts: [], outputArtifacts: ['deploy_url'] },
      executionPolicy: { sync: false, retries: 1, timeoutMinutes: 20, escalationOnFailure: true },
      approval: { requireHumanBeforeDispatch: false, requireHumanBeforeMerge: true },
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

function makeContext(overrides?: Partial<SkillDispatchContext>): SkillDispatchContext {
  return {
    skillId: 'skill.deploy-service',
    conversationId: 'conv_123',
    userMessage: 'Deploy checkout-service to staging',
    workingDir: '/repos/checkout-service',
    inputs: { service_name: 'checkout-service' },
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
  cancelDispatch: ReturnType<typeof vi.fn>;
  getHealth: ReturnType<typeof vi.fn>;
} {
  const client = {
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
    cancelDispatch: ReturnType<typeof vi.fn>;
    getHealth: ReturnType<typeof vi.fn>;
  };
  return client;
}

// ─── buildDispatchRequest ───

describe('buildDispatchRequest', () => {
  it('assembles all fields from merged skill object and context', () => {
    const skill = makeSkillObject();
    const ctx = makeContext();
    const result = buildDispatchRequest(skill, ctx, '# SKILL.md content');

    expect(result.skillId).toBe('skill.deploy-service');
    expect(result.skillName).toBe('deploy-service');
    expect(result.skillVersion).toBe('1.2.0');
    expect(result.skillContent).toBe('# SKILL.md content');
    expect(result.environment.toolsRequired).toEqual(['git', 'docker']);
    expect(result.environment.permissions.filesystem.read).toBe(true);
    expect(result.dispatch.targetSelection.repoPolicy).toBe('explicit');
    expect(result.dispatch.workerClass).toEqual(['implementation']);
    expect(result.dispatch.executionPolicy.timeoutMinutes).toBe(20);
    expect(result.dispatch.approval.requireHumanBeforeMerge).toBe(true);
    expect(result.verification.smokeChecks).toEqual(['staging-smoke-pass']);
    expect(result.context.conversationId).toBe('conv_123');
    expect(result.context.userMessage).toBe('Deploy checkout-service to staging');
    expect(result.context.inputs.service_name).toBe('checkout-service');
  });

  it('handles optional context fields', () => {
    const skill = makeSkillObject();
    const ctx = makeContext({ conversationId: undefined, workingDir: undefined });
    const result = buildDispatchRequest(skill, ctx, 'content');

    expect(result.context.conversationId).toBeUndefined();
    expect(result.context.workingDir).toBeUndefined();
  });
});

// ─── dispatchToKarvi ───

describe('dispatchToKarvi', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('returns fallback_local when skill not found', async () => {
    const client = makeMockKarviClient();
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(null),
      karviClient: client,
      db,
    };
    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('fallback_local');
    if (result.type === 'fallback_local') {
      expect(result.reason).toContain('Skill not found');
    }
  });

  it('returns fallback_local when dispatch.mode is local', async () => {
    const client = makeMockKarviClient();
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject({ mode: 'local' })),
      karviClient: client,
      db,
    };
    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('fallback_local');
    if (result.type === 'fallback_local') {
      expect(result.reason).toContain("'local'");
    }
  });

  it('returns dispatched on successful Karvi execution', async () => {
    // Insert skill instance for telemetry foreign key
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
    ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

    const client = makeMockKarviClient();
    client.dispatchSkill.mockResolvedValueOnce({
      dispatchId: 'dispatch_001',
      status: 'pending',
    });
    client.getDispatchStatus.mockResolvedValueOnce({
      id: 'dispatch_001',
      status: 'completed',
      type: 'skill',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      result: {
        skillId: 'skill.deploy-service',
        status: 'success',
        durationMs: 5000,
        steps: [{ stepId: 'plan', type: 'plan', status: 'success', artifacts: [] }],
        outputs: { deploy_url: 'https://staging.example.com' },
        verification: { smokeChecksPassed: true, failedChecks: [] },
        telemetry: { tokensUsed: 1000, costUsd: 0.05, runtime: 'claude', model: 'claude-sonnet-4-5-20250514', stepsExecuted: 1 },
      },
    });

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# Deploy SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('dispatched');
    if (result.type === 'dispatched') {
      expect(result.result.status).toBe('success');
      expect(result.result.outputs.deploy_url).toBe('https://staging.example.com');
    }

    // Verify dispatchSkill was called with correct request
    expect(client.dispatchSkill).toHaveBeenCalledOnce();
    const sentRequest = client.dispatchSkill.mock.calls[0][0];
    expect(sentRequest.skillId).toBe('skill.deploy-service');
    expect(sentRequest.skillContent).toBe('# Deploy SKILL.md');
  });

  it('returns approval_required when Karvi requires approval', async () => {
    const client = makeMockKarviClient();
    client.dispatchSkill.mockRejectedValueOnce(
      new KarviApiError('APPROVAL_REQUIRED', 'pending_abc123'),
    );

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('approval_required');
    if (result.type === 'approval_required') {
      expect(result.pendingId).toBe('pending_abc123');
      expect(result.skillName).toBe('deploy-service');
      expect(result.sideEffects).toBe(true);
      expect(result.executionMode).toBe('active');
    }
  });

  it('extracts pendingApprovalId from error details when available', async () => {
    const client = makeMockKarviClient();
    client.dispatchSkill.mockRejectedValueOnce(
      new KarviApiError('APPROVAL_REQUIRED', 'Human approval needed', { pendingApprovalId: 'appr_structured_123' }),
    );

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('approval_required');
    if (result.type === 'approval_required') {
      expect(result.pendingId).toBe('appr_structured_123');
    }
  });

  it('returns fallback_local when Karvi is unreachable', async () => {
    const client = makeMockKarviClient();
    client.dispatchSkill.mockRejectedValueOnce(
      new KarviNetworkError('Connection refused'),
    );

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('fallback_local');
    if (result.type === 'fallback_local') {
      expect(result.reason).toContain('Karvi unreachable');
    }
  });

  it('returns fallback_local when SKILL.md cannot be read', async () => {
    const client = makeMockKarviClient();
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => { throw new Error('File not found'); },
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('fallback_local');
    if (result.type === 'fallback_local') {
      expect(result.reason).toContain('Failed to read SKILL.md');
    }
  });

  it('records telemetry after successful dispatch', async () => {
    const client = makeMockKarviClient();
    client.dispatchSkill.mockResolvedValueOnce({
      dispatchId: 'dispatch_002',
      status: 'pending',
    });
    client.getDispatchStatus.mockResolvedValueOnce({
      id: 'dispatch_002',
      status: 'completed',
      type: 'skill',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      result: {
        skillId: 'skill.deploy-service',
        status: 'success',
        durationMs: 3000,
        steps: [],
        outputs: {},
        verification: { smokeChecksPassed: true, failedChecks: [] },
        telemetry: { tokensUsed: 500, costUsd: 0.02, runtime: 'claude', model: 'claude-sonnet-4-5-20250514', stepsExecuted: 0 },
      },
    });

    // Insert a skill_instance record so telemetry recording works
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
    ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    await dispatchToKarvi(makeContext(), deps);

    // Check that run was recorded
    const runs = db.prepare('SELECT * FROM skill_runs WHERE skill_instance_id = ?')
      .all('skill.deploy-service') as Array<Record<string, unknown>>;
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe('success');
    expect(runs[0].duration_ms).toBe(3000);

    // Check counters updated
    const instance = db.prepare('SELECT run_count, success_count FROM skill_instances WHERE id = ?')
      .get('skill.deploy-service') as Record<string, unknown>;
    expect(instance.run_count).toBe(1);
    expect(instance.success_count).toBe(1);
  });
});

// ─── Health check + fallback strategy ───

describe('dispatchToKarvi fallback strategies', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('returns fallback_local when health check fails and fallback=local', async () => {
    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: false });

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject({ fallback: 'local' })),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('fallback_local');
    if (result.type === 'fallback_local') {
      expect(result.reason).toBe('Karvi health check failed');
    }
  });

  it('returns queued when health check fails and fallback=queue', async () => {
    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: false });

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject({ fallback: 'queue' })),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('queued');
    if (result.type === 'queued') {
      expect(result.reason).toBe('Karvi health check failed');
      expect(result.queueId).toMatch(/^dq_/);
    }

    // Verify row was inserted in dispatch_queue
    const rows = db.prepare('SELECT * FROM dispatch_queue').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].skill_id).toBe('skill.deploy-service');
    expect(rows[0].status).toBe('pending');
  });

  it('returns rejected when health check fails and fallback=reject', async () => {
    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: false });

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject({ fallback: 'reject' })),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('rejected');
    if (result.type === 'rejected') {
      expect(result.reason).toBe('Karvi health check failed');
    }
  });

  it('returns queued on network error when fallback=queue', async () => {
    const client = makeMockKarviClient();
    // Health check passes but dispatch fails with network error
    client.getHealth.mockResolvedValueOnce({ ok: true });
    client.dispatchSkill.mockRejectedValueOnce(
      new KarviNetworkError('Connection reset'),
    );

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject({ fallback: 'queue' })),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('queued');
    if (result.type === 'queued') {
      expect(result.reason).toContain('Karvi unreachable');
    }
  });

  it('returns rejected on network error when fallback=reject', async () => {
    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: true });
    client.dispatchSkill.mockRejectedValueOnce(
      new KarviNetworkError('Connection reset'),
    );

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject({ fallback: 'reject' })),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('rejected');
    if (result.type === 'rejected') {
      expect(result.reason).toContain('Karvi unreachable');
    }
  });

  it('defaults fallback to local when not explicitly set (backward compat)', async () => {
    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: false });

    // makeSkillObject defaults fallback to 'local'
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('fallback_local');
  });
});

// ─── Queue processing ───

describe('processDispatchQueue', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('processes pending items when Karvi is healthy', async () => {
    // Insert a pending queue item
    db.prepare(
      `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason, max_retries)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('dq_test_1', 'skill.deploy', '{"skillId":"skill.deploy","skillName":"deploy","skillVersion":"1.0","skillContent":"","environment":{"toolsRequired":[],"toolsOptional":[],"permissions":{"filesystem":{"read":true,"write":false},"network":{"read":true,"write":false},"process":{"spawn":false},"secrets":{"read":[]}},"externalSideEffects":false,"executionMode":"advisory"},"dispatch":{"targetSelection":{"repoPolicy":"explicit","runtimeOptions":[]},"workerClass":[],"handoff":{"inputArtifacts":[],"outputArtifacts":[]},"executionPolicy":{"sync":false,"retries":1,"timeoutMinutes":20,"escalationOnFailure":false},"approval":{"requireHumanBeforeDispatch":false,"requireHumanBeforeMerge":false}},"verification":{"smokeChecks":[],"assertions":[],"humanCheckpoints":[],"outcomeSignals":[]},"context":{"userMessage":"test","inputs":{}}}', 'health check failed', 3);

    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: true });
    client.dispatchSkill.mockResolvedValueOnce({ dispatchId: 'disp-001', status: 'pending' });

    const { processDispatchQueue } = await import('./skill-dispatcher');
    const result = await processDispatchQueue(client, db);

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    // Verify status updated
    const row = db.prepare("SELECT status FROM dispatch_queue WHERE id = 'dq_test_1'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('dispatched');
  });

  it('returns zero when Karvi is unhealthy', async () => {
    db.prepare(
      `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason)
       VALUES (?, ?, ?, ?)`,
    ).run('dq_test_2', 'skill.deploy', '{}', 'reason');

    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: false });

    const { processDispatchQueue } = await import('./skill-dispatcher');
    const result = await processDispatchQueue(client, db);

    expect(result.processed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('marks as failed when retries exhausted', async () => {
    db.prepare(
      `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason, retry_count, max_retries)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('dq_test_3', 'skill.deploy', '{"skillId":"x","skillName":"x","skillVersion":"1","skillContent":"","environment":{"toolsRequired":[],"toolsOptional":[],"permissions":{"filesystem":{"read":false,"write":false},"network":{"read":false,"write":false},"process":{"spawn":false},"secrets":{"read":[]}},"externalSideEffects":false,"executionMode":"advisory"},"dispatch":{"targetSelection":{"repoPolicy":"explicit","runtimeOptions":[]},"workerClass":[],"handoff":{"inputArtifacts":[],"outputArtifacts":[]},"executionPolicy":{"sync":false,"retries":0,"timeoutMinutes":1,"escalationOnFailure":false},"approval":{"requireHumanBeforeDispatch":false,"requireHumanBeforeMerge":false}},"verification":{"smokeChecks":[],"assertions":[],"humanCheckpoints":[],"outcomeSignals":[]},"context":{"userMessage":"test","inputs":{}}}', 'reason', 2, 3);

    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: true });
    client.dispatchSkill.mockRejectedValueOnce(new Error('dispatch failed'));

    const { processDispatchQueue } = await import('./skill-dispatcher');
    const result = await processDispatchQueue(client, db);

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);

    const row = db.prepare("SELECT status, retry_count FROM dispatch_queue WHERE id = 'dq_test_3'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('failed');
    expect(row.retry_count).toBe(3);
  });

  it('increments retry_count on dispatch failure when retries remain', async () => {
    db.prepare(
      `INSERT INTO dispatch_queue (id, skill_id, request_json, fallback_reason, retry_count, max_retries)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('dq_test_4', 'skill.deploy', '{"skillId":"x","skillName":"x","skillVersion":"1","skillContent":"","environment":{"toolsRequired":[],"toolsOptional":[],"permissions":{"filesystem":{"read":false,"write":false},"network":{"read":false,"write":false},"process":{"spawn":false},"secrets":{"read":[]}},"externalSideEffects":false,"executionMode":"advisory"},"dispatch":{"targetSelection":{"repoPolicy":"explicit","runtimeOptions":[]},"workerClass":[],"handoff":{"inputArtifacts":[],"outputArtifacts":[]},"executionPolicy":{"sync":false,"retries":0,"timeoutMinutes":1,"escalationOnFailure":false},"approval":{"requireHumanBeforeDispatch":false,"requireHumanBeforeMerge":false}},"verification":{"smokeChecks":[],"assertions":[],"humanCheckpoints":[],"outcomeSignals":[]},"context":{"userMessage":"test","inputs":{}}}', 'reason', 0, 3);

    const client = makeMockKarviClient();
    client.getHealth.mockResolvedValueOnce({ ok: true });
    client.dispatchSkill.mockRejectedValueOnce(new Error('temporary failure'));

    const { processDispatchQueue } = await import('./skill-dispatcher');
    const result = await processDispatchQueue(client, db);

    expect(result.failed).toBe(1);

    const row = db.prepare("SELECT status, retry_count FROM dispatch_queue WHERE id = 'dq_test_4'")
      .get() as Record<string, unknown>;
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(1);
  });
});

// ─── timeout auto-cancel ───

describe('pollForCompletion auto-cancel on timeout', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('calls cancelDispatch when polling times out', async () => {
    // Insert skill instance for telemetry recording
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
    ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

    const client = makeMockKarviClient();
    client.dispatchSkill.mockResolvedValueOnce({
      dispatchId: 'dispatch_timeout',
      status: 'pending',
    });
    // Always return 'running' so it times out
    client.getDispatchStatus.mockResolvedValue({
      id: 'dispatch_timeout',
      status: 'running',
      type: 'skill',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      result: null,
    });
    client.cancelDispatch.mockResolvedValueOnce({ id: 'dispatch_timeout', cancelled: true });

    // Use a skill with very short timeout to avoid slow test
    const skillObj = makeSkillObject();
    skillObj.dispatch.executionPolicy.timeoutMinutes = 0; // 0 minutes = 0 poll attempts

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(skillObj),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('dispatched');
    if (result.type === 'dispatched') {
      expect(result.result.status).toBe('failure');
      expect(result.result.verification.failedChecks).toContain('timeout');
    }

    // Verify cancelDispatch was called
    expect(client.cancelDispatch).toHaveBeenCalledWith('dispatch_timeout');
  });

  it('still returns timeout result when cancelDispatch fails', async () => {
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
    ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

    const client = makeMockKarviClient();
    client.dispatchSkill.mockResolvedValueOnce({
      dispatchId: 'dispatch_timeout2',
      status: 'pending',
    });
    client.getDispatchStatus.mockResolvedValue({
      id: 'dispatch_timeout2',
      status: 'running',
      type: 'skill',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      result: null,
    });
    // Cancel itself fails
    client.cancelDispatch.mockRejectedValueOnce(new Error('Network error'));

    const skillObj = makeSkillObject();
    skillObj.dispatch.executionPolicy.timeoutMinutes = 0;

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(skillObj),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const result = await dispatchToKarvi(makeContext(), deps);
    expect(result.type).toBe('dispatched');
    if (result.type === 'dispatched') {
      expect(result.result.status).toBe('failure');
      expect(result.result.verification.failedChecks).toContain('timeout');
    }
  });
});

// ─── resubmitWithApproval ───

describe('resubmitWithApproval', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
  });

  it('sends approval token in the dispatch request', async () => {
    const client = makeMockKarviClient();
    client.dispatchSkill.mockResolvedValueOnce({
      dispatchId: 'dispatch_003',
      status: 'pending',
    });
    client.getDispatchStatus.mockResolvedValueOnce({
      id: 'dispatch_003',
      status: 'completed',
      type: 'skill',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
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

    // Insert skill instance for telemetry
    db.prepare(
      `INSERT INTO skill_instances (id, skill_id, name, status, run_count, success_count)
       VALUES (?, ?, ?, ?, 0, 0)`,
    ).run('skill.deploy-service', 'skill.deploy-service', 'deploy-service', 'promoted');

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const token = {
      pendingId: 'pending_abc123',
      approvedBy: 'human',
      approvedAt: '2026-01-01T00:00:00Z',
    };

    const result = await resubmitWithApproval(makeContext(), token, deps);
    expect(result.type).toBe('dispatched');

    // Verify the approval token was included
    const sentRequest = client.dispatchSkill.mock.calls[0][0];
    expect(sentRequest.approvalToken).toEqual(token);
  });

  it('returns fallback_local when skill not found', async () => {
    const client = makeMockKarviClient();
    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(null),
      karviClient: client,
      db,
    };

    const token = { pendingId: 'p1', approvedBy: 'human', approvedAt: '2026-01-01T00:00:00Z' };
    const result = await resubmitWithApproval(makeContext(), token, deps);
    expect(result.type).toBe('fallback_local');
  });

  it('returns fallback_local when Karvi is unreachable on resubmit', async () => {
    const client = makeMockKarviClient();
    client.dispatchSkill.mockRejectedValueOnce(
      new KarviNetworkError('Connection refused'),
    );

    const deps: DispatchDeps = {
      skillObjectLookup: makeLookup(makeSkillObject()),
      karviClient: client,
      db,
      readSkillContent: () => '# SKILL.md',
    };

    const token = { pendingId: 'p1', approvedBy: 'human', approvedAt: '2026-01-01T00:00:00Z' };
    const result = await resubmitWithApproval(makeContext(), token, deps);
    expect(result.type).toBe('fallback_local');
    if (result.type === 'fallback_local') {
      expect(result.reason).toContain('Karvi unreachable');
    }
  });
});
