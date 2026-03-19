import { describe, it, expect } from 'vitest';
import { parseSkillYaml, serializeSkillObject } from './yaml-parser';
const VALID_SKILL_YAML = `
kind: SkillObject
apiVersion: volva.ai/v0
id: skill.arch-spec
name: arch-spec
version: "0.1.0"
status: sandbox

identity:
  summary: "Crystallize architecture from fuzzy concepts"
  owners:
    human: [alice]
    agent: [volva]
  domain: architecture
  tags: [spec, design]
  maturity: emerging
  riskTier: low

purpose:
  problemShapes: [ambiguous-intent, architecture-crystallization]
  desiredOutcomes: [reviewable-spec-stack]
  nonGoals: [direct-implementation]
  notFor: [production-ops]

routing:
  description: "Trigger when user has a fuzzy architecture concept"
  triggerWhen:
    - user has fuzzy concept needing architecture structure
  doNotTriggerWhen:
    - task is already implementation-ready
  priority: 50
  conflictsWith: []
  mayChainTo: []

contract:
  inputs:
    required:
      - { name: concept, type: string, description: "The fuzzy concept to crystallize" }
    optional: []
  outputs:
    primary:
      - { name: spec_stack, type: string, description: "Reviewable spec stack" }
    secondary: []
  successCriteria:
    - has-boundaries
    - has-non-goals
  failureModes:
    - { mode: unclear_input, mitigation: "ask clarifying questions" }

package:
  root: skills/arch-spec
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
    stablePath: "\${SKILL_DATA}/arch-spec/"
    files: []

environment:
  toolsRequired: []
  toolsOptional: []
  permissions:
    filesystem: { read: true, write: false }
    network: { read: false, write: false }
    process: { spawn: false }
    secrets: { read: [] }
  externalSideEffects: false
  executionMode: assistive

dispatch:
  mode: local
  targetSelection:
    repoPolicy: explicit
    runtimeOptions: []
  workerClass: []
  handoff:
    inputArtifacts: []
    outputArtifacts: []
  executionPolicy:
    sync: false
    retries: 1
    timeoutMinutes: 30
    escalationOnFailure: true
  approval:
    requireHumanBeforeDispatch: false
    requireHumanBeforeMerge: true

verification:
  smokeChecks: [has-boundaries, has-non-goals]
  assertions: []
  humanCheckpoints: [boundary-review]
  outcomeSignals: []

memory:
  localMemoryPolicy:
    canStore: [drafts, logs]
    cannotStore: [secrets]
  precedentWriteback:
    enabled: true
    target: edda
    when: []

governance:
  mutability:
    agentMayEdit: [routing.priority]
    agentMayPropose: [contract.inputs]
    humanApprovalRequired: [status]
    forbiddenWithoutHuman: [enabling-destructive-actions]
  reviewPolicy:
    requiredReviewers: [owner]
  promotionGates: []
  rollbackPolicy:
    allowed: true
    rollbackOn: []
  supersession:
    supersedes: []
    supersededBy: null
`;

describe('parseSkillYaml', () => {
  it('parses valid YAML into SkillObject', () => {
    const result = parseSkillYaml(VALID_SKILL_YAML);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.kind).toBe('SkillObject');
    expect(result.data.id).toBe('skill.arch-spec');
    expect(result.data.status).toBe('sandbox');
    expect(result.data.identity.summary).toBe('Crystallize architecture from fuzzy concepts');
    expect(result.data.environment.executionMode).toBe('assistive');
  });

  it('returns error for malformed YAML syntax', () => {
    const malformed = `
kind: SkillObject
  bad-indent: [
    unclosed
`;
    const result = parseSkillYaml(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('YAML parse error');
  });

  it('returns error for missing required fields', () => {
    const incomplete = `
kind: SkillObject
apiVersion: volva.ai/v0
id: skill.test
`;
    const result = parseSkillYaml(incomplete);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('returns error for invalid enum values', () => {
    const yaml = VALID_SKILL_YAML.replace('status: sandbox', 'status: invalid_status');
    const result = parseSkillYaml(yaml);
    expect(result.ok).toBe(false);
  });

  it('returns error for empty input', () => {
    const result = parseSkillYaml('');
    expect(result.ok).toBe(false);
  });

  it('accepts optional telemetry and lifecycle sections', () => {
    const withOptionals = VALID_SKILL_YAML + `
telemetry:
  track:
    - metric: run_count
    - metric: success_count
  thresholds:
    promotion_min_success: 3
  reporting:
    target: edda
    frequency: on_governance

lifecycle:
  createdFrom: []
  currentStage: capture
  promotionPath: [draft, sandbox, promoted, core]
  retirementCriteria: []
  lastReviewedAt: null
`;
    const result = parseSkillYaml(withOptionals);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.telemetry?.track).toHaveLength(2);
    expect(result.data.lifecycle?.currentStage).toBe('capture');
  });
});

describe('serializeSkillObject', () => {
  it('produces valid YAML string', () => {
    const parseResult = parseSkillYaml(VALID_SKILL_YAML);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const yamlOutput = serializeSkillObject(parseResult.data);
    expect(typeof yamlOutput).toBe('string');
    expect(yamlOutput).toContain('kind: SkillObject');
    expect(yamlOutput).toContain('id: skill.arch-spec');
  });
});

describe('roundtrip: serialize then parse', () => {
  it('preserves data through serialize -> parse cycle', () => {
    const first = parseSkillYaml(VALID_SKILL_YAML);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const serialized = serializeSkillObject(first.data);
    const second = parseSkillYaml(serialized);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.data.kind).toBe(first.data.kind);
    expect(second.data.id).toBe(first.data.id);
    expect(second.data.name).toBe(first.data.name);
    expect(second.data.status).toBe(first.data.status);
    expect(second.data.identity).toEqual(first.data.identity);
    expect(second.data.purpose).toEqual(first.data.purpose);
    expect(second.data.routing).toEqual(first.data.routing);
    expect(second.data.contract).toEqual(first.data.contract);
    expect(second.data.environment).toEqual(first.data.environment);
    expect(second.data.dispatch).toEqual(first.data.dispatch);
    expect(second.data.verification).toEqual(first.data.verification);
    expect(second.data.memory).toEqual(first.data.memory);
    expect(second.data.governance).toEqual(first.data.governance);
  });
});
