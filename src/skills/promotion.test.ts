import { describe, it, expect } from 'vitest';
import { evaluatePromotionGates, checkRetirement } from './promotion';
import type { SkillMetrics } from './telemetry';
import type { SkillObject } from '../schemas/skill-object';

// ─── Fixtures ───

function makeMetrics(overrides: Partial<SkillMetrics> = {}): SkillMetrics {
  return {
    runCount: 5,
    successCount: 4,
    lastUsedAt: new Date().toISOString(),
    recentOutcomes: [],
    ...overrides,
  };
}

function makeSkillObject(
  overrides: {
    triggerWhen?: string[];
    doNotTriggerWhen?: string[];
    smokeChecks?: string[];
    supersededBy?: string | null;
    promotionMinSuccess?: number;
    retirementIdleDays?: number;
  } = {},
): SkillObject {
  return {
    kind: 'SkillObject',
    apiVersion: 'v0',
    id: 'sk-test',
    name: 'test-skill',
    version: '1.0.0',
    status: 'sandbox',
    identity: {
      summary: 'Test skill',
      owners: { human: ['dev'], agent: ['volva'] },
      domain: 'test',
      tags: ['test'],
      maturity: 'emerging',
      riskTier: 'low',
    },
    purpose: {
      problemShapes: ['test problem'],
      desiredOutcomes: ['test outcome'],
      nonGoals: [],
      notFor: [],
    },
    routing: {
      description: 'test routing',
      triggerWhen: overrides.triggerWhen ?? ['user asks for test'],
      doNotTriggerWhen: overrides.doNotTriggerWhen ?? ['user asks for prod'],
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
      root: '.',
      entryFile: 'SKILL.md',
      references: [],
      scripts: [],
      assets: [],
      config: { schemaFile: '', dataFile: '' },
      hooks: [],
      localState: { enabled: false, stablePath: '', files: [] },
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
      targetSelection: { repoPolicy: 'current', runtimeOptions: [] },
      workerClass: [],
      handoff: { inputArtifacts: [], outputArtifacts: [] },
      executionPolicy: {
        sync: true,
        retries: 0,
        timeoutMinutes: 5,
        escalationOnFailure: false,
      },
      approval: {
        requireHumanBeforeDispatch: false,
        requireHumanBeforeMerge: false,
      },
    },
    verification: {
      smokeChecks: overrides.smokeChecks ?? ['output file exists'],
      assertions: [],
      humanCheckpoints: [],
      outcomeSignals: [],
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
      supersession: {
        supersedes: [],
        supersededBy: overrides.supersededBy ?? null,
      },
    },
    telemetry: {
      track: [],
      thresholds: {
        promotion_min_success:
          overrides.promotionMinSuccess ?? 3,
        retirement_idle_days:
          overrides.retirementIdleDays ?? 90,
      },
      reporting: { target: 'edda', frequency: 'on_governance' },
    },
  };
}

// ─── evaluatePromotionGates ───

describe('evaluatePromotionGates', () => {
  it('passes min_success when successCount >= threshold', () => {
    const metrics = makeMetrics({ successCount: 3 });
    const skill = makeSkillObject();
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'min_success');
    expect(gate?.passed).toBe(true);
    expect(gate?.detail).toContain('3/3');
  });

  it('fails min_success when successCount < threshold', () => {
    const metrics = makeMetrics({ successCount: 2 });
    const skill = makeSkillObject();
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'min_success');
    expect(gate?.passed).toBe(false);
    expect(result.blockers).toContain('min_success');
  });

  it('respects custom promotion_min_success threshold', () => {
    const metrics = makeMetrics({ successCount: 5 });
    const skill = makeSkillObject({ promotionMinSuccess: 10 });
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'min_success');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('5/10');
  });

  it('no_critical_gotchas always passes (requires manual review)', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject();
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'no_critical_gotchas');
    expect(gate?.passed).toBe(true);
  });

  it('passes trigger_boundary when both arrays non-empty', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({
      triggerWhen: ['a'],
      doNotTriggerWhen: ['b'],
    });
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'trigger_boundary');
    expect(gate?.passed).toBe(true);
  });

  it('fails trigger_boundary when triggerWhen is empty', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({
      triggerWhen: [],
      doNotTriggerWhen: ['b'],
    });
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'trigger_boundary');
    expect(gate?.passed).toBe(false);
    expect(result.blockers).toContain('trigger_boundary');
  });

  it('fails trigger_boundary when doNotTriggerWhen is empty', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({
      triggerWhen: ['a'],
      doNotTriggerWhen: [],
    });
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'trigger_boundary');
    expect(gate?.passed).toBe(false);
  });

  it('passes verification_exists when smokeChecks has items', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({ smokeChecks: ['check 1'] });
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'verification_exists');
    expect(gate?.passed).toBe(true);
  });

  it('fails verification_exists when smokeChecks is empty', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({ smokeChecks: [] });
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'verification_exists');
    expect(gate?.passed).toBe(false);
    expect(result.blockers).toContain('verification_exists');
  });

  it('human_review always blocks', () => {
    const metrics = makeMetrics({ successCount: 100 });
    const skill = makeSkillObject();
    const result = evaluatePromotionGates(metrics, skill);
    const gate = result.gates.find((g) => g.gate === 'human_review');
    expect(gate?.passed).toBe(false);
    expect(result.blockers).toContain('human_review');
  });

  it('is never eligible because human_review always blocks', () => {
    const metrics = makeMetrics({ successCount: 10 });
    const skill = makeSkillObject({
      triggerWhen: ['a'],
      doNotTriggerWhen: ['b'],
      smokeChecks: ['check'],
    });
    const result = evaluatePromotionGates(metrics, skill);
    expect(result.eligible).toBe(false);
    expect(result.blockers).toEqual(['human_review']);
  });

  it('returns all 5 gates', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject();
    const result = evaluatePromotionGates(metrics, skill);
    expect(result.gates).toHaveLength(5);
    const gateNames = result.gates.map((g) => g.gate);
    expect(gateNames).toEqual([
      'min_success',
      'no_critical_gotchas',
      'trigger_boundary',
      'verification_exists',
      'human_review',
    ]);
  });

  it('handles zero metrics', () => {
    const metrics = makeMetrics({
      runCount: 0,
      successCount: 0,
      lastUsedAt: null,
      recentOutcomes: [],
    });
    const skill = makeSkillObject();
    const result = evaluatePromotionGates(metrics, skill);
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain('min_success');
    expect(result.blockers).toContain('human_review');
  });
});

// ─── checkRetirement ───

describe('checkRetirement', () => {
  it('retires when supersededBy is set', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({ supersededBy: 'sk-better' });
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(true);
    expect(result.reason).toContain('Superseded by sk-better');
  });

  it('does not retire when supersededBy is null', () => {
    const metrics = makeMetrics();
    const skill = makeSkillObject({ supersededBy: null });
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it('retires when idle >= 90 days', () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const metrics = makeMetrics({ lastUsedAt: oldDate.toISOString() });
    const skill = makeSkillObject();
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(true);
    expect(result.reason).toContain('No usage for');
    expect(result.reason).toContain('threshold: 90');
  });

  it('does not retire when idle < 90 days', () => {
    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const metrics = makeMetrics({ lastUsedAt: recentDate.toISOString() });
    const skill = makeSkillObject();
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(false);
  });

  it('respects custom retirement_idle_days threshold', () => {
    const date = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
    const metrics = makeMetrics({ lastUsedAt: date.toISOString() });
    const skill = makeSkillObject({ retirementIdleDays: 30 });
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(true);
    expect(result.reason).toContain('threshold: 30');
  });

  it('does not retire when lastUsedAt is null', () => {
    const metrics = makeMetrics({ lastUsedAt: null });
    const skill = makeSkillObject();
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(false);
  });

  it('supersededBy takes priority over idle check', () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const metrics = makeMetrics({ lastUsedAt: recentDate.toISOString() });
    const skill = makeSkillObject({ supersededBy: 'sk-new' });
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(true);
    expect(result.reason).toContain('Superseded');
  });

  it('handles zero metrics without retiring', () => {
    const metrics = makeMetrics({
      runCount: 0,
      successCount: 0,
      lastUsedAt: null,
      recentOutcomes: [],
    });
    const skill = makeSkillObject();
    const result = checkRetirement(metrics, skill);
    expect(result.shouldRetire).toBe(false);
  });
});
