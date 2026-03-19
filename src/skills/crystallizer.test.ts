import { describe, it, expect } from 'vitest';
import { crystallize } from './crystallizer';
import type { SkillCandidate } from './harvest';
import { SkillObjectSchema } from '../schemas/skill-object';

// ─── Test Fixtures ───

const FULL_CANDIDATE: SkillCandidate = {
  name: 'deploy-service',
  summary: 'Deploy a service to staging/production with smoke tests',
  problemShapes: ['need to deploy a service safely'],
  desiredOutcomes: ['service running in target environment'],
  nonGoals: ['infrastructure provisioning'],
  triggerWhen: ['user requests deploy of specific service'],
  doNotTriggerWhen: ['no artifact specified', 'target env unclear'],
  methodOutline: ['build artifact', 'deploy to staging', 'run smoke tests', 'promote to prod'],
  observedGotchas: ['healthcheck green does not mean checkout path safe'],
};

const CANDIDATE_NO_ANTI_TRIGGERS: SkillCandidate = {
  name: 'code-review',
  summary: 'Review code for quality and correctness',
  problemShapes: ['code needs review before merge'],
  desiredOutcomes: ['reviewed code with actionable feedback'],
  nonGoals: ['automated fixing'],
  triggerWhen: ['PR opened for review'],
  doNotTriggerWhen: [],
  methodOutline: ['read diff', 'check for issues', 'leave comments'],
  observedGotchas: ['style nits distract from logic errors'],
};

const CANDIDATE_NO_ANTI_NO_GOTCHAS: SkillCandidate = {
  name: 'quick-search',
  summary: 'Search codebase for patterns',
  problemShapes: ['need to find code references'],
  desiredOutcomes: ['list of matching files'],
  nonGoals: ['refactoring'],
  triggerWhen: ['user asks to find something in code'],
  doNotTriggerWhen: [],
  methodOutline: ['grep codebase'],
  observedGotchas: [],
};

const CANDIDATE_ALL_EMPTY_FALLBACKS: SkillCandidate = {
  name: 'bare-skill',
  summary: 'Minimal skill with no extras',
  problemShapes: ['generic problem'],
  desiredOutcomes: ['generic outcome'],
  nonGoals: [],
  triggerWhen: ['always'],
  doNotTriggerWhen: [],
  methodOutline: ['do the thing'],
  observedGotchas: [],
};

// ─── Tests ───

describe('crystallize', () => {
  it('produces output that passes SkillObjectSchema.safeParse', () => {
    const result = crystallize(FULL_CANDIDATE);

    const parsed = SkillObjectSchema.safeParse(result.skillObject);
    expect(parsed.success).toBe(true);
  });

  it('sets status to draft', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillObject.status).toBe('draft');
  });

  it('sets currentStage to crystallize', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillObject.lifecycle?.currentStage).toBe('crystallize');
  });

  it('generates a kebab-case id from candidate name', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillObject.id).toBe('skill.deploy-service');
  });

  it('populates routing.doNotTriggerWhen from candidate', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillObject.routing.doNotTriggerWhen).toEqual([
      'no artifact specified',
      'target env unclear',
    ]);
  });

  it('derives doNotTriggerWhen from gotchas when candidate.doNotTriggerWhen is empty', () => {
    const result = crystallize(CANDIDATE_NO_ANTI_TRIGGERS);
    expect(result.skillObject.routing.doNotTriggerWhen.length).toBeGreaterThan(0);
    expect(result.skillObject.routing.doNotTriggerWhen[0]).toBe(
      'style nits distract from logic errors',
    );
  });

  it('derives doNotTriggerWhen from nonGoals when gotchas also empty', () => {
    const result = crystallize(CANDIDATE_NO_ANTI_NO_GOTCHAS);
    expect(result.skillObject.routing.doNotTriggerWhen.length).toBeGreaterThan(0);
    expect(result.skillObject.routing.doNotTriggerWhen[0]).toBe('refactoring');
  });

  it('falls back to placeholder when all sources are empty', () => {
    const result = crystallize(CANDIDATE_ALL_EMPTY_FALLBACKS);
    expect(result.skillObject.routing.doNotTriggerWhen.length).toBeGreaterThan(0);
    expect(result.skillObject.routing.doNotTriggerWhen[0]).toContain(
      'not yet defined',
    );
  });

  it('doNotTriggerWhen is never empty regardless of input', () => {
    const candidates = [
      FULL_CANDIDATE,
      CANDIDATE_NO_ANTI_TRIGGERS,
      CANDIDATE_NO_ANTI_NO_GOTCHAS,
      CANDIDATE_ALL_EMPTY_FALLBACKS,
    ];
    for (const candidate of candidates) {
      const result = crystallize(candidate);
      expect(result.skillObject.routing.doNotTriggerWhen.length).toBeGreaterThan(0);
    }
  });

  it('produces valid yaml string', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.yaml).toContain('kind: SkillObject');
    expect(result.yaml).toContain('deploy-service');
  });

  it('SKILL.md contains When to Use section', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillMd).toContain('## When to Use');
    expect(result.skillMd).toContain('user requests deploy of specific service');
  });

  it('SKILL.md contains When NOT to Use section', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillMd).toContain('## When NOT to Use');
    expect(result.skillMd).toContain('no artifact specified');
  });

  it('SKILL.md contains Method section', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillMd).toContain('## Method');
    expect(result.skillMd).toContain('1. build artifact');
  });

  it('SKILL.md contains Known Gotchas section', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillMd).toContain('## Known Gotchas');
    expect(result.skillMd).toContain('healthcheck green');
  });

  it('maps candidate fields to correct SkillObject sections', () => {
    const result = crystallize(FULL_CANDIDATE);
    expect(result.skillObject.identity.summary).toBe(FULL_CANDIDATE.summary);
    expect(result.skillObject.purpose.problemShapes).toEqual(FULL_CANDIDATE.problemShapes);
    expect(result.skillObject.purpose.desiredOutcomes).toEqual(FULL_CANDIDATE.desiredOutcomes);
    expect(result.skillObject.purpose.nonGoals).toEqual(FULL_CANDIDATE.nonGoals);
    expect(result.skillObject.routing.triggerWhen).toEqual(FULL_CANDIDATE.triggerWhen);
    expect(result.skillObject.contract.successCriteria).toEqual(FULL_CANDIDATE.desiredOutcomes);
  });

  it('all 12 sections are populated in the output', () => {
    const result = crystallize(FULL_CANDIDATE);
    const obj = result.skillObject;
    expect(obj.identity).toBeDefined();
    expect(obj.purpose).toBeDefined();
    expect(obj.routing).toBeDefined();
    expect(obj.contract).toBeDefined();
    expect(obj.package).toBeDefined();
    expect(obj.environment).toBeDefined();
    expect(obj.dispatch).toBeDefined();
    expect(obj.verification).toBeDefined();
    expect(obj.memory).toBeDefined();
    expect(obj.governance).toBeDefined();
    expect(obj.telemetry).toBeDefined();
    expect(obj.lifecycle).toBeDefined();
  });
});
