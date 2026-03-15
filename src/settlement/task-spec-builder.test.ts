import { describe, it, expect } from 'vitest';
import { buildTaskSpec } from './task-spec-builder';
import type { TaskCard } from '../schemas/card';

const baseCard: TaskCard = {
  intent: 'Refactor auth module',
  inputs: { repo: 'github.com/test/app', branch: 'main' },
  constraints: ['no breaking changes', 'keep backward compatibility'],
  success_condition: 'all tests pass with new auth flow',
  version: 1,
};

describe('buildTaskSpec', () => {
  it('produces valid JSON string', () => {
    const result = buildTaskSpec(baseCard);
    expect(typeof result).toBe('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('maps intent correctly', () => {
    const result = JSON.parse(buildTaskSpec(baseCard)) as Record<string, unknown>;
    expect(result.intent).toBe('Refactor auth module');
  });

  it('maps inputs correctly', () => {
    const result = JSON.parse(buildTaskSpec(baseCard)) as Record<string, unknown>;
    expect(result.inputs).toEqual({ repo: 'github.com/test/app', branch: 'main' });
  });

  it('maps constraints correctly', () => {
    const result = JSON.parse(buildTaskSpec(baseCard)) as Record<string, unknown>;
    expect(result.constraints).toEqual(['no breaking changes', 'keep backward compatibility']);
  });

  it('maps success_condition correctly', () => {
    const result = JSON.parse(buildTaskSpec(baseCard)) as Record<string, unknown>;
    expect(result.success_condition).toBe('all tests pass with new auth flow');
  });

  it('handles empty inputs', () => {
    const card: TaskCard = { ...baseCard, inputs: {} };
    const result = JSON.parse(buildTaskSpec(card)) as Record<string, unknown>;
    expect(result.inputs).toEqual({});
  });

  it('handles empty constraints', () => {
    const card: TaskCard = { ...baseCard, constraints: [] };
    const result = JSON.parse(buildTaskSpec(card)) as Record<string, unknown>;
    expect(result.constraints).toEqual([]);
  });

  it('handles null success_condition', () => {
    const card: TaskCard = { ...baseCard, success_condition: null };
    const result = JSON.parse(buildTaskSpec(card)) as Record<string, unknown>;
    expect(result.success_condition).toBeNull();
  });
});
