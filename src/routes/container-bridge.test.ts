import { describe, it, expect } from 'vitest';
import {
  resolveContainer,
  containerToConversationMode,
  shouldBypassContainerRouting,
} from './container-bridge';
import type { SkillLookup } from '../skills/types';
import type { RoutingContext } from '../containers/types';

// ─── Helpers ───

function emptyLookup(): SkillLookup {
  return { findMatching: () => [] };
}

function skillLookup(skillId: string): SkillLookup {
  return {
    findMatching: () => [
      { skillId, confidence: 'high' as const, matchedTriggers: ['deploy'] },
    ],
  };
}

function ctx(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return { userMessage: 'hello', ...overrides };
}

// ─── containerToConversationMode ───

describe('containerToConversationMode', () => {
  it('maps world → world_design', () => {
    expect(containerToConversationMode('world')).toBe('world_design');
  });

  it('maps shape → world_design', () => {
    expect(containerToConversationMode('shape')).toBe('world_design');
  });

  it('maps task → task', () => {
    expect(containerToConversationMode('task')).toBe('task');
  });

  it('maps skill → task', () => {
    expect(containerToConversationMode('skill')).toBe('task');
  });

  it('passes through currentMode for non-world/shape containers', () => {
    expect(containerToConversationMode('task', 'pipeline_design')).toBe('pipeline_design');
    expect(containerToConversationMode('skill', 'workflow_design')).toBe('workflow_design');
    expect(containerToConversationMode('review', 'commerce_design')).toBe('commerce_design');
    expect(containerToConversationMode('harvest', 'org_design')).toBe('org_design');
  });

  it('forces world_design for world even if currentMode set', () => {
    expect(containerToConversationMode('world', 'task')).toBe('world_design');
  });

  it('forces world_design for shape even if currentMode set', () => {
    expect(containerToConversationMode('shape', 'task')).toBe('world_design');
  });
});

// ─── shouldBypassContainerRouting ───

describe('shouldBypassContainerRouting', () => {
  it('returns true for world_management', () => {
    expect(shouldBypassContainerRouting('world_management')).toBe(true);
  });

  it('returns false for world_design', () => {
    expect(shouldBypassContainerRouting('world_design')).toBe(false);
  });

  it('returns false for task', () => {
    expect(shouldBypassContainerRouting('task')).toBe(false);
  });

  it('returns false for pipeline_design', () => {
    expect(shouldBypassContainerRouting('pipeline_design')).toBe(false);
  });
});

// ─── resolveContainer ───

describe('resolveContainer', () => {
  it('resolves explore → shape with decision pipeline redirect', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'I want to do something interesting' }),
      emptyLookup(),
    );
    expect(result.selection.primary).toBe('shape');
    expect(result.redirectToDecisionPipeline).toBe(true);
    expect(result.mappedMode).toBe('world_design');
  });

  it('resolves act + skill match → skill without redirect', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'deploy checkout-service', intentType: 'confirm' }),
      skillLookup('deploy-svc'),
    );
    expect(result.selection.primary).toBe('skill');
    expect(result.selection.skillId).toBe('deploy-svc');
    expect(result.redirectToDecisionPipeline).toBe(false);
  });

  it('resolves act + no skill → task without redirect', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'run the migration', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(result.selection.primary).toBe('task');
    expect(result.redirectToDecisionPipeline).toBe(false);
  });

  it('resolves world context → world without redirect', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'update the project', hasActiveWorld: true }),
      emptyLookup(),
    );
    expect(result.selection.primary).toBe('world');
    expect(result.redirectToDecisionPipeline).toBe(false);
  });

  it('resolves harvest → harvest without redirect', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'save this as a reusable skill', intentType: 'settle_signal' }),
      emptyLookup(),
    );
    expect(result.selection.primary).toBe('harvest');
    expect(result.redirectToDecisionPipeline).toBe(false);
  });

  it('passes through currentMode for non-shape containers', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'run the build', intentType: 'confirm' }),
      emptyLookup(),
      'pipeline_design',
    );
    expect(result.mappedMode).toBe('pipeline_design');
  });

  it('overrides currentMode for shape', () => {
    const result = resolveContainer(
      ctx({ userMessage: 'help me think about this' }),
      emptyLookup(),
      'pipeline_design',
    );
    expect(result.selection.primary).toBe('shape');
    expect(result.mappedMode).toBe('world_design');
  });

  it('returns correct behavior for confidence levels', () => {
    const highResult = resolveContainer(
      ctx({ hasActiveWorld: true }),
      emptyLookup(),
    );
    expect(highResult.behavior).toBe('proceed');

    const medResult = resolveContainer(
      ctx({ userMessage: 'run something', intentType: 'confirm' }),
      emptyLookup(),
    );
    expect(medResult.behavior).toBe('showRationale');
  });
});
