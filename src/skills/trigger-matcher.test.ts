import { describe, it, expect } from 'vitest';
import { matchSkills, createSkillLookup } from './trigger-matcher';
import type { SkillIndexEntry } from './types';
import type { SkillObject } from '../schemas/skill-object';

/** Minimal SkillObject stub for tests — only fields accessed by registry/matcher. */
function stubSkillObject(overrides: Partial<SkillIndexEntry>): SkillIndexEntry {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    status: 'sandbox',
    priority: 50,
    filePath: '/fake/skill.object.yaml',
    triggerWhen: [],
    doNotTriggerWhen: [],
    skillObject: {} as SkillObject,
    ...overrides,
  };
}

describe('matchSkills', () => {
  it('matches by triggerWhen keywords', () => {
    const entries = [
      stubSkillObject({
        id: 'sk-1',
        triggerWhen: ['deploy', 'release'],
      }),
    ];
    const result = matchSkills('I want to deploy the app', entries);
    expect(result).toHaveLength(1);
    expect(result[0].skillId).toBe('sk-1');
    expect(result[0].matchedTriggers).toEqual(['deploy']);
    expect(result[0].confidence).toBe('medium');
  });

  it('returns high confidence for 2+ trigger hits', () => {
    const entries = [
      stubSkillObject({
        id: 'sk-1',
        triggerWhen: ['deploy', 'release'],
      }),
    ];
    const result = matchSkills('deploy a new release now', entries);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe('high');
    expect(result[0].matchedTriggers).toEqual(['deploy', 'release']);
  });

  it('excludes when doNotTriggerWhen matches', () => {
    const entries = [
      stubSkillObject({
        id: 'sk-1',
        triggerWhen: ['deploy'],
        doNotTriggerWhen: ['rollback'],
      }),
    ];
    const result = matchSkills('rollback the deploy', entries);
    expect(result).toHaveLength(0);
  });

  it('filters out draft skills', () => {
    const entries = [
      stubSkillObject({
        id: 'sk-draft',
        status: 'draft',
        triggerWhen: ['deploy'],
      }),
    ];
    const result = matchSkills('deploy something', entries);
    expect(result).toHaveLength(0);
  });

  it('filters out deprecated skills', () => {
    const entries = [
      stubSkillObject({
        id: 'sk-dep',
        status: 'deprecated',
        triggerWhen: ['deploy'],
      }),
    ];
    const result = matchSkills('deploy something', entries);
    expect(result).toHaveLength(0);
  });

  it('filters out superseded skills', () => {
    const entries = [
      stubSkillObject({
        id: 'sk-sup',
        status: 'superseded',
        triggerWhen: ['deploy'],
      }),
    ];
    const result = matchSkills('deploy something', entries);
    expect(result).toHaveLength(0);
  });

  it('allows sandbox, promoted, and core skills', () => {
    const entries = [
      stubSkillObject({ id: 'sk-sb', status: 'sandbox', triggerWhen: ['deploy'], priority: 30 }),
      stubSkillObject({ id: 'sk-pr', status: 'promoted', triggerWhen: ['deploy'], priority: 50 }),
      stubSkillObject({ id: 'sk-co', status: 'core', triggerWhen: ['deploy'], priority: 80 }),
    ];
    const result = matchSkills('deploy', entries);
    expect(result).toHaveLength(3);
  });

  it('sorts multi-match results by priority descending', () => {
    const entries = [
      stubSkillObject({ id: 'sk-low', priority: 10, triggerWhen: ['build'] }),
      stubSkillObject({ id: 'sk-high', priority: 90, triggerWhen: ['build'] }),
      stubSkillObject({ id: 'sk-mid', priority: 50, triggerWhen: ['build'] }),
    ];
    const result = matchSkills('run the build', entries);
    expect(result.map((m) => m.skillId)).toEqual(['sk-high', 'sk-mid', 'sk-low']);
  });

  it('returns empty array when no triggers match', () => {
    const entries = [
      stubSkillObject({ id: 'sk-1', triggerWhen: ['deploy'] }),
    ];
    const result = matchSkills('nothing relevant here', entries);
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive for matching', () => {
    const entries = [
      stubSkillObject({ id: 'sk-1', triggerWhen: ['Deploy'] }),
    ];
    const result = matchSkills('DEPLOY something', entries);
    expect(result).toHaveLength(1);
  });
});

describe('createSkillLookup', () => {
  it('returns a SkillLookup with findMatching method', () => {
    const fakeRegistry = {
      list: () => [
        stubSkillObject({ id: 'sk-1', triggerWhen: ['test'], priority: 50 }),
      ],
    };
    const lookup = createSkillLookup(fakeRegistry as never);
    const matches = lookup.findMatching('run test suite');
    expect(matches).toHaveLength(1);
    expect(matches[0].skillId).toBe('sk-1');
  });
});
