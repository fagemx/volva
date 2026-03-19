import { describe, it, expect, vi } from 'vitest';
import { Database } from 'bun:sqlite';
import { initSchema } from '../db';
import { selectContainer } from '../containers/router';
import { checkContainerTransition, spawnFromWorld } from '../containers/transitions';
import { matchSkills } from '../skills/trigger-matcher';
import { recordRun, getMetrics } from '../skills/telemetry';
import { evaluatePromotionGates } from '../skills/promotion';
import { capturePattern, SkillCandidateSchema } from '../skills/harvest';
import { crystallize } from '../skills/crystallizer';
import { SkillObjectSchema } from '../schemas/skill-object';
import { parseSkillYaml } from '../skills/yaml-parser';
import { resolveContainer, shouldBypassContainerRouting } from './container-bridge';
import type { RoutingContext } from '../containers/types';
import type { SkillLookup, SkillIndexEntry } from '../skills/types';
import type { LLMClient } from '../llm/client';

// ─── Test YAML ───

// Reuse the canonical YAML from registry.test.ts with deploy triggers
const TEST_SKILL_YAML = `
kind: SkillObject
apiVersion: volva.ai/v0
id: skill.deploy-svc
name: deploy-service
version: "1.0.0"
status: sandbox

identity:
  summary: "Deploy services"
  owners:
    human: [alice]
    agent: [volva]
  domain: devops
  tags: [deploy]
  maturity: emerging
  riskTier: low

purpose:
  problemShapes: [service-deployment]
  desiredOutcomes: [deployed-service]
  nonGoals: [monitoring]
  notFor: [database-migrations]

routing:
  description: "Trigger on deploy requests"
  triggerWhen:
    - deploy
    - service
  doNotTriggerWhen:
    - debug
  priority: 50
  conflictsWith: []
  mayChainTo: []

contract:
  inputs:
    required:
      - { name: service, type: string, description: "Service name" }
    optional: []
  outputs:
    primary:
      - { name: result, type: string, description: "Deploy result" }
    secondary: []
  successCriteria: [service-running]
  failureModes:
    - { mode: timeout, mitigation: "retry" }

package:
  root: skills/deploy
  entryFile: SKILL.md
  references: []
  scripts: []
  assets: []
  config:
    schemaFile: config.schema.json
    dataFile: config.json
  hooks: []
  localState:
    enabled: true
    stablePath: "\${SKILL_DATA}/deploy/"
    files: []

environment:
  toolsRequired: [docker]
  toolsOptional: []
  permissions:
    filesystem: { read: true, write: false }
    network: { read: true, write: true }
    process: { spawn: true }
    secrets: { read: [] }
  externalSideEffects: true
  executionMode: active

dispatch:
  mode: local
  targetSelection:
    repoPolicy: explicit
    runtimeOptions: [bun]
  workerClass: [general]
  handoff:
    inputArtifacts: []
    outputArtifacts: []
  executionPolicy:
    sync: false
    retries: 1
    timeoutMinutes: 10
    escalationOnFailure: true
  approval:
    requireHumanBeforeDispatch: false
    requireHumanBeforeMerge: false

verification:
  smokeChecks: [service responds]
  assertions: []
  humanCheckpoints: []
  outcomeSignals: []

memory:
  localMemoryPolicy:
    canStore: [deploy-log]
    cannotStore: [credentials]
  precedentWriteback:
    enabled: false
    target: edda
    when: []

governance:
  mutability:
    agentMayEdit: [verification]
    agentMayPropose: [routing]
    humanApprovalRequired: [contract]
    forbiddenWithoutHuman: [governance]
  reviewPolicy:
    requiredReviewers: [owner]
  promotionGates: []
  rollbackPolicy:
    allowed: true
    rollbackOn: [test-failure]
  supersession:
    supersedes: []
    supersededBy: null
`;

// ─── Helpers ───

function emptyLookup(): SkillLookup {
  return { findMatching: () => [] };
}

function getTestEntry(): SkillIndexEntry {
  const parsed = parseSkillYaml(TEST_SKILL_YAML);
  if (!parsed.ok) throw new Error(`Test YAML parse failed: ${parsed.error}`);
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    status: parsed.data.status,
    priority: parsed.data.routing.priority,
    filePath: '/tmp/test/skill.object.yaml',
    triggerWhen: parsed.data.routing.triggerWhen,
    doNotTriggerWhen: parsed.data.routing.doNotTriggerWhen,
    skillObject: parsed.data,
  };
}

function ctx(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return { userMessage: 'hello', ...overrides };
}

function createMockLlm(response: Record<string, unknown>): LLMClient {
  return {
    generateStructured: vi.fn().mockResolvedValue({ ok: true, data: response }),
    generateText: vi.fn().mockResolvedValue(''),
  } as unknown as LLMClient;
}

// ─── GP-1: Skill Container Selection ───

describe('GP-1: Skill Container Selection', () => {
  it('routes to skill container when trigger matches', () => {
    const entry = getTestEntry();
    const matches = matchSkills('deploy checkout-service', [entry]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].skillId).toBe('skill.deploy-svc');
  });

  it('selects skill container via 6-gate router', () => {
    const entry = getTestEntry();
    const lookup: SkillLookup = {
      findMatching: (context: string) => matchSkills(context, [entry]),
    };
    const result = selectContainer(
      ctx({ userMessage: 'deploy checkout-service', intentType: 'confirm' }),
      lookup,
    );
    expect(result.primary).toBe('skill');
    expect(result.confidence).toBe('high');
  });

  it('excludes skills matching doNotTriggerWhen', () => {
    const entry = getTestEntry();
    const matches = matchSkills('debug the service', [entry]);
    expect(matches.length).toBe(0);
  });
});

// ─── GP-2: Shape Fallback on Ambiguity ───

describe('GP-2: Shape Fallback on Ambiguity', () => {
  it('falls back to shape for vague messages', () => {
    const result = selectContainer(
      ctx({ userMessage: 'I want to do something interesting' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('shape');
  });

  it('bridge marks shape for decision pipeline redirect', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'I need help figuring things out' }),
      emptyLookup(),
    );
    expect(result.selection.primary).toBe('shape');
    expect(result.redirectToDecisionPipeline).toBe(true);
  });
});

// ─── GP-3: Full Harvest Flow ───

describe('GP-3: Full Harvest Flow', () => {
  it('captures pattern and crystallizes to valid SkillObject', async () => {
    const mockCandidate = {
      name: 'deploy-workflow',
      summary: 'A deployment workflow',
      problemShapes: ['deployment complexity'],
      desiredOutcomes: ['automated deploy'],
      nonGoals: ['monitoring'],
      triggerWhen: ['deploy', 'release'],
      doNotTriggerWhen: ['debug'],
      methodOutline: ['checkout', 'build', 'deploy'],
      observedGotchas: ['env vars missing'],
    };
    const llm = createMockLlm(mockCandidate);
    const history = [
      { role: 'user', content: 'Deploy checkout-service' },
      { role: 'assistant', content: 'OK deploying' },
    ];

    const captureResult = await capturePattern(llm, history, 'deployment');
    expect(captureResult.ok).toBe(true);
    if (!captureResult.ok) return;

    const crystalResult = crystallize(captureResult.data);
    expect(crystalResult.skillObject.lifecycle?.currentStage).toBe('crystallize');

    const validation = SkillObjectSchema.safeParse(crystalResult.skillObject);
    expect(validation.success).toBe(true);
    expect(crystalResult.yaml.length).toBeGreaterThan(0);
    expect(crystalResult.skillMd).toContain('deploy-workflow');
  });
});

// ─── GP-4: Lifecycle Telemetry → Promotion Check ───

describe('GP-4: Lifecycle Telemetry → Promotion', () => {
  it('tracks runs and evaluates promotion gates', () => {
    const db = new Database(':memory:');
    initSchema(db);

    const instanceId = 'inst-001';
    db.prepare(
      "INSERT INTO skill_instances (id, skill_id, name, status, current_stage, run_count, success_count, created_at, updated_at) VALUES (?, 'sk-1', 'test', 'sandbox', 'execute', 0, 0, datetime('now'), datetime('now'))",
    ).run(instanceId);

    for (let i = 0; i < 3; i++) {
      recordRun(db, { skillInstanceId: instanceId, outcome: 'success' });
    }

    const metrics = getMetrics(db, instanceId);
    expect(metrics).not.toBeNull();
    expect(metrics!.runCount).toBe(3);
    expect(metrics!.successCount).toBe(3);

    const skillObject = getTestEntry().skillObject;
    const promotion = evaluatePromotionGates(metrics!, skillObject);

    const autoGates = promotion.gates.filter((g) => g.gate !== 'human_review');
    for (const gate of autoGates) {
      expect(gate.passed).toBe(true);
    }

    expect(promotion.blockers).toContain('human_review');
    expect(promotion.eligible).toBe(false);

    db.close();
  });
});

// ─── GP-5: World Spawn Lifecycle ───

describe('GP-5: World Spawn Lifecycle', () => {
  it('spawns child task from world', () => {
    const spawn = spawnFromWorld('world-001', 'task', 'deploy staging');
    expect(spawn).not.toBeNull();
    expect(spawn!.parentWorld).toBe('world-001');
    expect(spawn!.childContainer).toBe('task');
  });

  it('rejects direct transition from world', () => {
    const transition = checkContainerTransition('world', 'task', 'want to do task');
    expect(transition.allowed).toBe(false);
  });

  it('rejects spawning world from world', () => {
    const spawn = spawnFromWorld('world-001', 'world', 'nested world');
    expect(spawn).toBeNull();
  });
});

// ─── GP-6: Secondary Container Detection ───

describe('GP-6: Secondary Container Detection', () => {
  it('detects secondary harvest from tail pattern', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Deploy checkout-service, then capture the flow as a skill', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(result.secondary).toBe('harvest');
  });

  it('no secondary without tail pattern', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Deploy checkout-service', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(result.secondary).toBeUndefined();
  });
});

// ─── GP-7: Harvest 2-Step Flow (SETTLE-01) ───

describe('GP-7: Harvest 2-Step Flow (SETTLE-01)', () => {
  it('step 1: capture returns candidate for review', async () => {
    const mockCandidate = {
      name: 'my-skill',
      summary: 'A skill',
      problemShapes: ['problem'],
      desiredOutcomes: ['outcome'],
      nonGoals: [],
      triggerWhen: ['trigger'],
      doNotTriggerWhen: ['anti'],
      methodOutline: ['step1'],
      observedGotchas: ['gotcha'],
    };
    const llm = createMockLlm(mockCandidate);

    const result = await capturePattern(llm, [{ role: 'user', content: 'do something' }], 'context');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(SkillCandidateSchema.safeParse(result.data).success).toBe(true);
    }
  });

  it('step 2: crystallize produces valid SkillObject with doNotTriggerWhen', () => {
    const candidate = {
      name: 'my-skill',
      summary: 'A reviewed skill',
      problemShapes: ['reviewed problem'],
      desiredOutcomes: ['reviewed outcome'],
      nonGoals: ['not this'],
      triggerWhen: ['when this'],
      doNotTriggerWhen: ['not when this'],
      methodOutline: ['step 1', 'step 2'],
      observedGotchas: ['watch out'],
    };

    const result = crystallize(candidate);
    expect(SkillObjectSchema.safeParse(result.skillObject).success).toBe(true);
    expect(result.skillObject.routing.doNotTriggerWhen.length).toBeGreaterThan(0);
  });
});

// ─── CONTRACT Validation ───

describe('CONTRACT Validation', () => {
  it('shouldBypassContainerRouting for world_management only', () => {
    expect(shouldBypassContainerRouting('world_management')).toBe(true);
    expect(shouldBypassContainerRouting('world_design')).toBe(false);
    expect(shouldBypassContainerRouting('task')).toBe(false);
  });

  it('harvest container is terminal', () => {
    const result = checkContainerTransition('harvest', 'task', 'want task');
    expect(result.allowed).toBe(false);
  });

  it('SkillCandidateSchema validates correct shape', () => {
    const valid = SkillCandidateSchema.safeParse({
      name: 'test', summary: 'test',
      problemShapes: ['p'], desiredOutcomes: ['o'], nonGoals: [],
      triggerWhen: ['t'], doNotTriggerWhen: ['n'],
      methodOutline: ['m'], observedGotchas: [],
    });
    expect(valid.success).toBe(true);
  });
});
