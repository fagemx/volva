import { describe, it, expect } from 'vitest';
import { formatPipelinePreview } from './pipeline-preview';
import type { PipelineCard } from '../schemas/card';

function emptyPipelineCard(): PipelineCard {
  return {
    name: null,
    steps: [],
    schedule: null,
    proposed_skills: [],
    pending: [],
    version: 1,
  };
}

describe('formatPipelinePreview', () => {
  it('empty card returns minimal output', () => {
    const card = emptyPipelineCard();
    const result = formatPipelinePreview(card);
    expect(result).toContain('(unnamed)');
    expect(result).toContain('(no steps defined)');
  });

  it('formats skill step correctly', () => {
    const card = emptyPipelineCard();
    card.name = 'CI Pipeline';
    card.steps = [
      {
        order: 0,
        type: 'skill',
        label: 'lint code',
        skill_name: 'eslint',
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: null,
        on_true: null,
        on_false: null,
      },
    ];
    const result = formatPipelinePreview(card);
    expect(result).toContain('CI Pipeline');
    expect(result).toContain('lint code');
    expect(result).toContain('skill: eslint');
  });

  it('formats gate step correctly', () => {
    const card = emptyPipelineCard();
    card.name = 'Deploy Pipeline';
    card.steps = [
      {
        order: 0,
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
    ];
    const result = formatPipelinePreview(card);
    expect(result).toContain('GATE: lint check');
    expect(result).toContain('condition: lint passes');
  });

  it('formats branch step correctly', () => {
    const card = emptyPipelineCard();
    card.name = 'Review Pipeline';
    card.steps = [
      {
        order: 0,
        type: 'branch',
        label: 'severity check',
        skill_name: null,
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: 'severity == high',
        on_true: 'rollback',
        on_false: 'continue',
      },
    ];
    const result = formatPipelinePreview(card);
    expect(result).toContain('BRANCH: severity check');
    expect(result).toContain('condition: severity == high');
    expect(result).toContain('on_true:  rollback');
    expect(result).toContain('on_false: continue');
  });

  it('handles branch with null on_true/on_false gracefully', () => {
    const card = emptyPipelineCard();
    card.name = 'Test';
    card.steps = [
      {
        order: 0,
        type: 'branch',
        label: 'check',
        skill_name: null,
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: 'x > 0',
        on_true: null,
        on_false: null,
      },
    ];
    const result = formatPipelinePreview(card);
    expect(result).toContain('on_true:  (not set)');
    expect(result).toContain('on_false: (not set)');
  });

  it('formats all three step types together', () => {
    const card = emptyPipelineCard();
    card.name = 'Full Pipeline';
    card.steps = [
      {
        order: 0,
        type: 'skill',
        label: 'scan',
        skill_name: 'scanner',
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
        label: 'quality gate',
        skill_name: null,
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: 'quality > 80',
        on_true: null,
        on_false: null,
      },
      {
        order: 2,
        type: 'branch',
        label: 'deploy decision',
        skill_name: null,
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: 'env == prod',
        on_true: 'deploy-prod',
        on_false: 'deploy-staging',
      },
    ];
    const result = formatPipelinePreview(card);
    expect(result).toContain('[0]');
    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('scan');
    expect(result).toContain('GATE: quality gate');
    expect(result).toContain('BRANCH: deploy decision');
  });
});
