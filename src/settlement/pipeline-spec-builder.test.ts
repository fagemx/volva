import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { buildPipelineSpec } from './pipeline-spec-builder';
import type { PipelineCard } from '../schemas/card';

const baseCard: PipelineCard = {
  name: 'Code Review Pipeline',
  steps: [
    {
      order: 0,
      type: 'skill',
      label: 'scan code',
      skill_name: 'code-scanner',
      instruction: null,
      revision_target: null,
      max_revision_cycles: null,
      condition: null,
      on_true: null,
      on_false: null,
    },
    {
      order: 1,
      type: 'gate',
      label: 'lint check',
      skill_name: null,
      instruction: null,
      revision_target: null,
      max_revision_cycles: null,
      condition: 'lint passes',
      on_true: null,
      on_false: null,
    },
    {
      order: 2,
      type: 'branch',
      label: 'severity check',
      skill_name: null,
      instruction: null,
      revision_target: null,
      max_revision_cycles: null,
      condition: 'is critical',
      on_true: 'hotfix',
      on_false: 'normal review',
    },
  ],
  schedule: 'daily',
  proposed_skills: [
    { name: 'code-scanner', type: 'analysis', description: 'Scans code for issues' },
  ],
  pending: [],
  version: 3,
};

describe('buildPipelineSpec', () => {
  it('produces valid YAML string', () => {
    const result = buildPipelineSpec(baseCard);
    expect(typeof result).toBe('string');
    expect(() => yaml.load(result)).not.toThrow();
  });

  it('maps name to pipeline.name', () => {
    const result = yaml.load(buildPipelineSpec(baseCard)) as Record<string, unknown>;
    const pipeline = result.pipeline as Record<string, unknown>;
    expect(pipeline.name).toBe('Code Review Pipeline');
  });

  it('uses fallback name when name is null', () => {
    const card: PipelineCard = { ...baseCard, name: null };
    const result = yaml.load(buildPipelineSpec(card)) as Record<string, unknown>;
    const pipeline = result.pipeline as Record<string, unknown>;
    expect(pipeline.name).toBe('Untitled Pipeline');
  });

  it('includes schedule', () => {
    const result = yaml.load(buildPipelineSpec(baseCard)) as Record<string, unknown>;
    const pipeline = result.pipeline as Record<string, unknown>;
    expect(pipeline.schedule).toBe('daily');
  });

  it('includes all steps with correct types', () => {
    const result = yaml.load(buildPipelineSpec(baseCard)) as Record<string, unknown>;
    const steps = result.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(3);
    expect(steps[0].type).toBe('skill');
    expect(steps[0].skill_name).toBe('code-scanner');
    expect(steps[1].type).toBe('gate');
    expect(steps[1].condition).toBe('lint passes');
    expect(steps[2].type).toBe('branch');
    expect(steps[2].on_true).toBe('hotfix');
    expect(steps[2].on_false).toBe('normal review');
  });

  it('includes proposed_skills', () => {
    const result = yaml.load(buildPipelineSpec(baseCard)) as Record<string, unknown>;
    const skills = result.proposed_skills as Array<Record<string, unknown>>;
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('code-scanner');
    expect(skills[0].type).toBe('analysis');
    expect(skills[0].description).toBe('Scans code for issues');
  });

  it('handles empty card gracefully', () => {
    const card: PipelineCard = {
      name: null,
      steps: [],
      schedule: null,
      proposed_skills: [],
      pending: [],
      version: 1,
    };
    const result = yaml.load(buildPipelineSpec(card)) as Record<string, unknown>;
    const pipeline = result.pipeline as Record<string, unknown>;
    expect(pipeline.name).toBe('Untitled Pipeline');
    expect(pipeline.schedule).toBeNull();
    const steps = result.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(0);
    const skills = result.proposed_skills as Array<Record<string, unknown>>;
    expect(skills).toHaveLength(0);
  });
});
