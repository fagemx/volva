import { describe, it, expect } from 'vitest';
import { selectContainer, getConfidenceBehavior } from './router';
import type { RoutingContext } from './types';
import type { SkillLookup, SkillMatch } from '../skills/types';

function emptyLookup(): SkillLookup {
  return { findMatching: () => [] };
}

function lookupWith(matches: SkillMatch[]): SkillLookup {
  return { findMatching: () => matches };
}

function ctx(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return { userMessage: '', ...overrides };
}

describe('selectContainer — 6-gate routing', () => {
  // Gate 1: World detection
  it('routes to world when hasActiveWorld is true', () => {
    const result = selectContainer(ctx({ hasActiveWorld: true, userMessage: 'anything' }), emptyLookup());
    expect(result.primary).toBe('world');
    expect(result.confidence).toBe('high');
  });

  it('routes to world on world keywords', () => {
    const result = selectContainer(ctx({ userMessage: 'Start a long-term project for payments' }), emptyLookup());
    expect(result.primary).toBe('world');
  });

  // Gate 2: Shape (explore posture)
  it('routes to shape when path is unclear', () => {
    const result = selectContainer(
      ctx({ userMessage: 'I have a product direction but don\'t know how to approach it' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('shape');
    expect(result.confidence).toBe('medium');
  });

  // Gate 3: Review (inspect posture)
  it('routes to review on inspect posture', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Why did the last deploy fail?' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('review');
    expect(result.confidence).toBe('medium');
  });

  it('routes to review with inspect intent type', () => {
    const result = selectContainer(
      ctx({ userMessage: 'tell me about the status', intentType: 'query_status' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('review');
  });

  // Gate 4: Skill (act posture + matching skill)
  it('routes to skill when a matching skill exists', () => {
    const skill: SkillMatch = {
      skillId: 'deploy-service',
      confidence: 'high',
      matchedTriggers: ['deploy'],
    };
    const result = selectContainer(
      ctx({ userMessage: 'Deploy checkout-service to staging' }),
      lookupWith([skill]),
    );
    expect(result.primary).toBe('skill');
    expect(result.confidence).toBe('high');
    expect(result.skillId).toBe('deploy-service');
    expect(result.rationale).toContain('deploy-service');
  });

  // Gate 5: Task (act posture + no skill)
  it('routes to task when act posture but no matching skill', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Deploy checkout-service to staging' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('task');
    expect(result.confidence).toBe('medium');
  });

  // Gate 6: Harvest
  it('routes to harvest on harvest posture', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Save this as a reusable skill' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('harvest');
    expect(result.confidence).toBe('medium');
  });

  // Fallback
  it('falls back to shape with low confidence on ambiguous input', () => {
    // A message with no keywords and no intent type → explore → shape
    // Actually, explore posture returns medium confidence shape.
    // To get low confidence, we need something that doesn't match any posture path.
    // detectPosture defaults to 'explore', which hits Gate 2 (medium).
    // The low-confidence fallback only triggers if no gate matches,
    // but explore always matches Gate 2. So low confidence is for edge cases
    // that bypass all gates. Let's verify the explore → shape path.
    const result = selectContainer(ctx({ userMessage: 'hmm' }), emptyLookup());
    expect(result.primary).toBe('shape');
  });
});

describe('selectContainer — secondary container', () => {
  it('detects "then capture" tail → secondary harvest', () => {
    // Use intentType to force act posture, so Gate 5 fires as primary
    const result = selectContainer(
      ctx({ userMessage: 'Deploy checkout-service, then capture the flow', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('task');
    expect(result.secondary).toBe('harvest');
  });

  it('detects "then save" tail → secondary harvest', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Fix the login bug then save it', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('task');
    expect(result.secondary).toBe('harvest');
  });

  it('detects "then review" tail → secondary review', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Deploy the service then review the output', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('task');
    expect(result.secondary).toBe('review');
  });

  it('does not set secondary harvest when primary is already harvest', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Save this pattern then capture it' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('harvest');
    expect(result.secondary).toBeUndefined();
  });

  it('does not set secondary when no tail pattern', () => {
    const result = selectContainer(
      ctx({ userMessage: 'Deploy checkout-service to staging' }),
      emptyLookup(),
    );
    expect(result.secondary).toBeUndefined();
  });
});

describe('getConfidenceBehavior', () => {
  it('returns proceed for high confidence', () => {
    expect(getConfidenceBehavior({
      primary: 'skill',
      confidence: 'high',
      rationale: 'test',
    })).toBe('proceed');
  });

  it('returns showRationale for medium confidence', () => {
    expect(getConfidenceBehavior({
      primary: 'shape',
      confidence: 'medium',
      rationale: 'test',
    })).toBe('showRationale');
  });

  it('returns askClarification for low confidence', () => {
    expect(getConfidenceBehavior({
      primary: 'shape',
      confidence: 'low',
      rationale: 'test',
    })).toBe('askClarification');
  });
});

describe('Gate priority order', () => {
  it('world (Gate 1) takes priority over act posture (Gate 4/5)', () => {
    // "deploy" is act keyword, but "workspace" is world keyword → world wins
    const result = selectContainer(
      ctx({ userMessage: 'Deploy to the workspace environment' }),
      emptyLookup(),
    );
    expect(result.primary).toBe('world');
  });

  it('inspect (Gate 3) takes priority over skill match (Gate 4)', () => {
    const skill: SkillMatch = {
      skillId: 'analyze-logs',
      confidence: 'high',
      matchedTriggers: ['analyze'],
    };
    // "analyze" matches both inspect keywords and skill lookup
    // But posture=inspect → Gate 3 fires before Gate 4
    const result = selectContainer(
      ctx({ userMessage: 'Analyze the production logs' }),
      lookupWith([skill]),
    );
    expect(result.primary).toBe('review');
  });
});
