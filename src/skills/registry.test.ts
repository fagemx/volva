import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillRegistry } from './registry';

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

function makeSecondSkillYaml(overrides: {
  id?: string;
  name?: string;
  status?: string;
  domain?: string;
  tags?: string;
  priority?: number;
}): string {
  return VALID_SKILL_YAML.replace('id: skill.arch-spec', `id: ${overrides.id ?? 'skill.second'}`)
    .replace('name: arch-spec', `name: ${overrides.name ?? 'second'}`)
    .replace('status: sandbox', `status: ${overrides.status ?? 'promoted'}`)
    .replace('domain: architecture', `domain: ${overrides.domain ?? 'testing'}`)
    .replace('tags: [spec, design]', `tags: [${overrides.tags ?? 'test, ci'}]`)
    .replace('priority: 50', `priority: ${String(overrides.priority ?? 70)}`);
}

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `volva-registry-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('SkillRegistry.scan', () => {
  it('returns found: 0 for empty directory', () => {
    const registry = new SkillRegistry();
    const result = registry.scan(testDir);
    expect(result.found).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('indexes a valid skill.object.yaml', () => {
    const skillDir = join(testDir, 'arch-spec');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'skill.object.yaml'), VALID_SKILL_YAML);

    const registry = new SkillRegistry();
    const result = registry.scan(testDir);

    expect(result.found).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('indexes multiple skill.object.yaml files in nested dirs', () => {
    const dir1 = join(testDir, 'skills', 'arch-spec');
    const dir2 = join(testDir, 'skills', 'second');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, 'skill.object.yaml'), VALID_SKILL_YAML);
    writeFileSync(
      join(dir2, 'skill.object.yaml'),
      makeSecondSkillYaml({ id: 'skill.second', name: 'second' }),
    );

    const registry = new SkillRegistry();
    const result = registry.scan(testDir);

    expect(result.found).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('skips invalid YAML gracefully and continues scanning', () => {
    const badDir = join(testDir, 'bad-skill');
    const goodDir = join(testDir, 'good-skill');
    mkdirSync(badDir, { recursive: true });
    mkdirSync(goodDir, { recursive: true });
    writeFileSync(join(badDir, 'skill.object.yaml'), 'invalid: [unclosed');
    writeFileSync(join(goodDir, 'skill.object.yaml'), VALID_SKILL_YAML);

    const registry = new SkillRegistry();
    const result = registry.scan(testDir);

    expect(result.found).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('bad-skill');
  });

  it('handles non-existent directory gracefully', () => {
    const registry = new SkillRegistry();
    const result = registry.scan(join(testDir, 'does-not-exist'));
    expect(result.found).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('SkillRegistry.get', () => {
  it('returns SkillObject for existing id', () => {
    const skillDir = join(testDir, 'arch-spec');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'skill.object.yaml'), VALID_SKILL_YAML);

    const registry = new SkillRegistry();
    registry.scan(testDir);

    const obj = registry.get('skill.arch-spec');
    expect(obj).not.toBeNull();
    expect(obj!.kind).toBe('SkillObject');
    expect(obj!.id).toBe('skill.arch-spec');
    expect(obj!.status).toBe('sandbox');
  });

  it('returns null for non-existing id', () => {
    const registry = new SkillRegistry();
    registry.scan(testDir);

    expect(registry.get('skill.nonexistent')).toBeNull();
  });
});

describe('SkillRegistry.list', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();

    // Create three skills with different properties
    const dir1 = join(testDir, 'skill-a');
    const dir2 = join(testDir, 'skill-b');
    const dir3 = join(testDir, 'skill-c');
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    mkdirSync(dir3, { recursive: true });

    writeFileSync(join(dir1, 'skill.object.yaml'), VALID_SKILL_YAML); // sandbox, architecture, [spec,design], priority 50
    writeFileSync(
      join(dir2, 'skill.object.yaml'),
      makeSecondSkillYaml({
        id: 'skill.deploy',
        name: 'deploy',
        status: 'promoted',
        domain: 'devops',
        tags: 'deploy, ci',
        priority: 80,
      }),
    );
    writeFileSync(
      join(dir3, 'skill.object.yaml'),
      makeSecondSkillYaml({
        id: 'skill.review',
        name: 'review',
        status: 'draft',
        domain: 'architecture',
        tags: 'review, spec',
        priority: 30,
      }),
    );

    registry.scan(testDir);
  });

  it('returns all entries without filter', () => {
    const entries = registry.list();
    expect(entries).toHaveLength(3);
  });

  it('sorts by priority descending', () => {
    const entries = registry.list();
    expect(entries[0].id).toBe('skill.deploy');
    expect(entries[1].id).toBe('skill.arch-spec');
    expect(entries[2].id).toBe('skill.review');
  });

  it('filters by minStatus', () => {
    const entries = registry.list({ minStatus: 'sandbox' });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.status !== 'draft')).toBe(true);
  });

  it('filters by domain', () => {
    const entries = registry.list({ domain: 'architecture' });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.skillObject.identity.domain === 'architecture')).toBe(true);
  });

  it('filters by tags', () => {
    const entries = registry.list({ tags: ['spec'] });
    expect(entries).toHaveLength(2);
  });

  it('combines multiple filters', () => {
    const entries = registry.list({
      minStatus: 'sandbox',
      domain: 'architecture',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('skill.arch-spec');
  });
});
