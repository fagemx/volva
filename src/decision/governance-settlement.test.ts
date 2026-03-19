import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from 'bun:sqlite';
import { createDb, initSchema } from '../db';
import { DecisionSessionManager } from './session-manager';
import type { ForgeBuildResult, ForgeBuildRequest } from '../karvi-client/schemas';
import type { WorldCard } from '../schemas/card';
import type { ThyraClient } from '../thyra-client/client';
import type { PackApplyData } from '../thyra-client/schemas';
import { buildVillagePack } from '../settlement/village-pack-builder';
import {
  verifyThyraHandoffRequirements,
  recordForgeBuild,
  settleGovernanceBuild,
  type GovernanceSettlementInput,
  type GovernanceSettlementDeps,
} from './governance-settlement';

// ─── Fixtures ───

function makeBuildResult(overrides?: Partial<ForgeBuildResult>): ForgeBuildResult {
  return {
    sessionId: 'session-001',
    status: 'success',
    durationMs: 5000,
    artifacts: [
      { type: 'config', path: '/village.yaml', description: 'Village pack YAML' },
      { type: 'spec', path: '/constitution.yaml', description: 'Constitution draft' },
      { type: 'config', path: '/chief.yaml', description: 'Chief configuration' },
    ],
    steps: [
      { stepId: 'step-1', type: 'build', status: 'success', artifacts: ['/village.yaml'] },
    ],
    telemetry: {
      tokensUsed: 1000,
      costUsd: 0.05,
      runtime: '5s',
      model: 'claude-3',
      stepsExecuted: 1,
    },
    ...overrides,
  };
}

function makeBuildRequest(overrides?: Partial<ForgeBuildRequest>): ForgeBuildRequest {
  return {
    sessionId: 'session-001',
    candidateId: 'gov-001',
    regime: 'governance',
    verdict: 'commit',
    whatToBuild: ['Constitution draft', 'Chief role spec'],
    whatNotToBuild: ['Dashboard'],
    rationale: ['Community needs governance'],
    evidenceUsed: ['Conflict data'],
    unresolvedRisks: ['Participation unknown'],
    regimeContext: {
      kind: 'governance',
      worldForm: 'market',
      minimumWorldShape: ['Stall registry', 'Transaction log'],
      firstCycleDesign: ['Weekly review'],
      stateDensityAssessment: 'medium',
      governancePressureAssessment: 'high',
      thyraHandoffRequirements: ['Chief must approve stall changes', 'Max 50 stalls'],
    },
    context: { workingDir: '/tmp', targetRepo: 'test-repo' },
    ...overrides,
  };
}

function makeWorldCard(): WorldCard {
  return {
    goal: 'Test Market',
    target_repo: 'test-repo',
    confirmed: {
      hard_rules: [{ description: 'No spam', scope: ['*'] }],
      soft_rules: [],
      must_have: ['stall-management'],
      success_criteria: [],
      evaluator_rules: [],
    },
    pending: [],
    chief_draft: { name: 'MarketBot', role: 'moderator', style: 'strict' },
    budget_draft: null,
    llm_preset: null,
    current_proposal: null,
    version: 1,
  };
}

function makeThyraClient(result?: Partial<PackApplyData>): ThyraClient {
  const applyVillagePack = vi.fn().mockResolvedValue({
    village_id: 'v-001',
    constitution_id: 'c-001',
    chief_id: 'ch-001',
    skills: [{ id: 's-001', name: 'stall-management' }],
    applied: true,
    ...result,
  });

  return { applyVillagePack } as unknown as ThyraClient;
}

// ─── Tests ───

describe('verifyThyraHandoffRequirements', () => {
  it('returns satisfied when artifacts exist', () => {
    const result = verifyThyraHandoffRequirements(
      ['Chief must approve stall changes', 'Max 50 stalls'],
      [{ type: 'config', path: '/village.yaml', description: 'Village pack' }],
    );
    expect(result.satisfied).toBe(true);
    expect(result.verified).toEqual(['Chief must approve stall changes', 'Max 50 stalls']);
    expect(result.missing).toEqual([]);
  });

  it('returns not satisfied when no artifacts', () => {
    const result = verifyThyraHandoffRequirements(
      ['Chief must approve stall changes'],
      [],
    );
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['Chief must approve stall changes']);
    expect(result.verified).toEqual([]);
  });

  it('handles empty requirements with artifacts', () => {
    const result = verifyThyraHandoffRequirements(
      [],
      [{ type: 'config', path: '/village.yaml', description: 'Village pack' }],
    );
    expect(result.satisfied).toBe(true);
    expect(result.verified).toEqual([]);
    expect(result.missing).toEqual([]);
  });
});

describe('recordForgeBuild', () => {
  let db: Database;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    // Need a decision session for FK
    db.run(
      `INSERT INTO decision_sessions (id, stage, status, key_unknowns_json) VALUES (?, ?, ?, ?)`,
      ['session-001', 'routing', 'active', '[]'],
    );
  });

  it('inserts forge build record and returns ID', () => {
    const buildResult = makeBuildResult();
    const id = recordForgeBuild(db, 'session-001', buildResult, 'governance');

    expect(id).toMatch(/^fb_/);

    const row = db.query('SELECT * FROM forge_builds WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.session_id).toBe('session-001');
    expect(row.regime).toBe('governance');
    expect(row.status).toBe('success');
    expect(row.duration_ms).toBe(5000);
    expect(row.artifact_count).toBe(3);
    expect(row.tokens_used).toBe(1000);
    expect(row.cost_usd).toBe(0.05);
  });

  it('records failed steps JSON', () => {
    const buildResult = makeBuildResult({
      steps: [
        { stepId: 'step-1', type: 'build', status: 'success', artifacts: [] },
        { stepId: 'step-2', type: 'validate', status: 'failure', artifacts: [] },
      ],
    });
    const id = recordForgeBuild(db, 'session-001', buildResult, 'governance');

    const row = db.query('SELECT failed_steps_json FROM forge_builds WHERE id = ?').get(id) as Record<string, unknown>;
    const failed = JSON.parse(row.failed_steps_json as string) as Array<{ stepId: string; type: string }>;
    expect(failed).toEqual([{ stepId: 'step-2', type: 'validate' }]);
  });
});

describe('settleGovernanceBuild', () => {
  let db: Database;
  let sessionManager: DecisionSessionManager;

  beforeEach(() => {
    db = createDb(':memory:');
    initSchema(db);
    sessionManager = new DecisionSessionManager(db);
  });

  function makeInput(overrides?: {
    buildResult?: Partial<ForgeBuildResult>;
    buildRequest?: Partial<ForgeBuildRequest>;
  }): GovernanceSettlementInput {
    return {
      sessionId: '',  // will be set after session creation
      buildResult: makeBuildResult(overrides?.buildResult),
      buildRequest: makeBuildRequest(overrides?.buildRequest),
      worldCard: makeWorldCard(),
    };
  }

  function makeDeps(thyra?: ThyraClient): GovernanceSettlementDeps {
    return {
      db,
      thyra: thyra ?? makeThyraClient(),
      sessionManager,
      buildVillagePack,
    };
  }

  it('happy path: successful build triggers Thyra settlement', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput();
    input.sessionId = session.id;
    const thyra = makeThyraClient();
    const deps = makeDeps(thyra);

    const result = await settleGovernanceBuild(input, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.villageId).toBe('v-001');
      expect(result.constitutionId).toBe('c-001');
      expect(result.chiefId).toBe('ch-001');
    }

    // Verify Thyra was called with village pack YAML
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(thyra.applyVillagePack).toHaveBeenCalledOnce();
    const yaml = (thyra.applyVillagePack as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(yaml).toContain('Test Market');
    expect(yaml).toContain('No spam');
  });

  it('records forge build in database', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput();
    input.sessionId = session.id;

    await settleGovernanceBuild(input, makeDeps());

    const rows = db.query('SELECT * FROM forge_builds WHERE session_id = ?').all(session.id) as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(rows[0].regime).toBe('governance');
    expect(rows[0].status).toBe('success');
  });

  it('records settlement_initiated and settlement_completed events', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput();
    input.sessionId = session.id;

    await settleGovernanceBuild(input, makeDeps());

    const events = db.query(
      'SELECT * FROM decision_events WHERE session_id = ? ORDER BY created_at ASC',
    ).all(session.id) as Record<string, unknown>[];
    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe('settlement_initiated');
    expect(events[0].object_type).toBe('settlement');
    expect(events[1].event_type).toBe('settlement_completed');
    expect(events[1].object_type).toBe('settlement');
  });

  it('rejects when build status is not success', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput({ buildResult: { status: 'failure' } });
    input.sessionId = session.id;

    const result = await settleGovernanceBuild(input, makeDeps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('verification');
      expect(result.error).toContain('did not succeed');
    }
  });

  it('rejects when regimeContext is not governance', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput({
      buildRequest: {
        regimeContext: {
          kind: 'economic',
          buyerHypothesis: 'test',
          painHypothesis: 'test',
          vehicleType: 'test',
          paymentEvidence: [],
          whyThisVehicleNow: [],
          nextSignalAfterBuild: [],
        },
      },
    });
    input.sessionId = session.id;

    const result = await settleGovernanceBuild(input, makeDeps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('verification');
      expect(result.error).toContain('Expected governance');
    }
  });

  it('rejects when no artifacts (handoff requirements not met)', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput({ buildResult: { artifacts: [] } });
    input.sessionId = session.id;

    const result = await settleGovernanceBuild(input, makeDeps());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('verification');
      expect(result.error).toContain('not satisfied');
    }
  });

  it('handles Thyra rejection gracefully', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput();
    input.sessionId = session.id;

    const thyra = {
      applyVillagePack: vi.fn().mockRejectedValue(new Error('Thyra rejected: invalid constitution')),
    } as unknown as ThyraClient;

    const result = await settleGovernanceBuild(input, makeDeps(thyra));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.phase).toBe('settlement');
      expect(result.error).toContain('Thyra rejected');
    }

    // settlement_initiated should still be recorded even though settlement failed
    const events = db.query(
      "SELECT * FROM decision_events WHERE session_id = ? AND event_type = 'settlement_initiated'",
    ).all(session.id) as Record<string, unknown>[];
    expect(events.length).toBe(1);
  });

  it('does not record settlement_completed when Thyra fails', async () => {
    const session = sessionManager.createSession({ title: 'Gov test' });
    const input = makeInput();
    input.sessionId = session.id;

    const thyra = {
      applyVillagePack: vi.fn().mockRejectedValue(new Error('Thyra down')),
    } as unknown as ThyraClient;

    await settleGovernanceBuild(input, makeDeps(thyra));

    const events = db.query(
      "SELECT * FROM decision_events WHERE session_id = ? AND event_type = 'settlement_completed'",
    ).all(session.id) as Record<string, unknown>[];
    expect(events.length).toBe(0);
  });
});
