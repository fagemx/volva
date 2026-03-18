import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { buildWorkflowSpec } from './workflow-spec-builder';
import type { WorkflowCard } from '../schemas/card';

const baseCard: WorkflowCard = {
  name: 'Deploy Pipeline',
  purpose: 'Automate deployment to production',
  steps: [
    { order: 0, description: 'Run tests', skill: 'test-runner', conditions: null },
    { order: 1, description: 'Build image', skill: 'docker', conditions: 'tests pass' },
    { order: 2, description: 'Deploy', skill: null, conditions: 'image built' },
  ],
  confirmed: {
    triggers: ['push to main', 'manual trigger'],
    exit_conditions: ['deployment healthy'],
    failure_handling: ['rollback to previous version'],
  },
  pending: [],
  version: 2,
};

describe('buildWorkflowSpec', () => {
  it('produces valid YAML string', () => {
    const result = buildWorkflowSpec(baseCard);
    expect(typeof result).toBe('string');
    expect(() => yaml.load(result)).not.toThrow();
  });

  it('maps name to workflow.name', () => {
    const result = yaml.load(buildWorkflowSpec(baseCard)) as Record<string, unknown>;
    const workflow = result.workflow as Record<string, unknown>;
    expect(workflow.name).toBe('Deploy Pipeline');
  });

  it('uses fallback name when name is null', () => {
    const card: WorkflowCard = { ...baseCard, name: null };
    const result = yaml.load(buildWorkflowSpec(card)) as Record<string, unknown>;
    const workflow = result.workflow as Record<string, unknown>;
    expect(workflow.name).toBe('Untitled Workflow');
  });

  it('maps purpose to workflow.purpose', () => {
    const result = yaml.load(buildWorkflowSpec(baseCard)) as Record<string, unknown>;
    const workflow = result.workflow as Record<string, unknown>;
    expect(workflow.purpose).toBe('Automate deployment to production');
  });

  it('uses empty string when purpose is null', () => {
    const card: WorkflowCard = { ...baseCard, purpose: null };
    const result = yaml.load(buildWorkflowSpec(card)) as Record<string, unknown>;
    const workflow = result.workflow as Record<string, unknown>;
    expect(workflow.purpose).toBe('');
  });

  it('includes all steps in order', () => {
    const result = yaml.load(buildWorkflowSpec(baseCard)) as Record<string, unknown>;
    const steps = result.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(3);
    expect(steps[0].order).toBe(0);
    expect(steps[0].description).toBe('Run tests');
    expect(steps[0].skill).toBe('test-runner');
    expect(steps[1].order).toBe(1);
    expect(steps[2].order).toBe(2);
    expect(steps[2].skill).toBeNull();
  });

  it('handles empty steps array', () => {
    const card: WorkflowCard = { ...baseCard, steps: [] };
    const result = yaml.load(buildWorkflowSpec(card)) as Record<string, unknown>;
    const steps = result.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(0);
  });

  it('includes triggers', () => {
    const result = yaml.load(buildWorkflowSpec(baseCard)) as Record<string, unknown>;
    expect(result.triggers).toEqual(['push to main', 'manual trigger']);
  });

  it('includes exit_conditions', () => {
    const result = yaml.load(buildWorkflowSpec(baseCard)) as Record<string, unknown>;
    expect(result.exit_conditions).toEqual(['deployment healthy']);
  });

  it('includes failure_handling', () => {
    const result = yaml.load(buildWorkflowSpec(baseCard)) as Record<string, unknown>;
    expect(result.failure_handling).toEqual(['rollback to previous version']);
  });

  it('handles empty confirmed arrays', () => {
    const card: WorkflowCard = {
      ...baseCard,
      confirmed: { triggers: [], exit_conditions: [], failure_handling: [] },
    };
    const result = yaml.load(buildWorkflowSpec(card)) as Record<string, unknown>;
    expect(result.triggers).toEqual([]);
    expect(result.exit_conditions).toEqual([]);
    expect(result.failure_handling).toEqual([]);
  });
});
