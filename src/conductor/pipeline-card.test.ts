import { describe, it, expect } from 'vitest';
import { createEmptyPipelineCard, modeToCardType, createEmptyCard } from './card-factories';
import { applyIntentToPipelineCard } from './card-mutations';
import type { PipelineCard } from '../schemas/card';
import type { Intent } from '../schemas/intent';

function makeEmptyPipeline(): PipelineCard {
  return createEmptyPipelineCard();
}

function makePipelineWithSteps(): PipelineCard {
  return {
    ...makeEmptyPipeline(),
    steps: [
      {
        order: 0,
        type: 'skill',
        label: 'scan code',
        skill_name: 'scan code',
        instruction: null,
        revision_target: null,
        max_revision_cycles: null,
        condition: null,
        on_true: null,
        on_false: null,
      },
    ],
  };
}

describe('createEmptyPipelineCard', () => {
  it('returns valid empty card', () => {
    const card = createEmptyPipelineCard();
    expect(card.name).toBeNull();
    expect(card.steps).toEqual([]);
    expect(card.schedule).toBeNull();
    expect(card.proposed_skills).toEqual([]);
    expect(card.pending).toEqual([]);
    expect(card.version).toBe(1);
  });
});

describe('applyIntentToPipelineCard', () => {
  it('new_intent sets name', () => {
    const card = makeEmptyPipeline();
    const intent: Intent = { type: 'new_intent', summary: 'My Pipeline' };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.name).toBe('My Pipeline');
  });

  it('add_info pushes skill steps', () => {
    const card = makeEmptyPipeline();
    const intent: Intent = {
      type: 'add_info',
      summary: 'add steps',
      entities: { step1: 'scan code', step2: 'open issue' },
    };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].type).toBe('skill');
    expect(result.steps[0].skill_name).toBe('scan code');
    expect(result.steps[0].order).toBe(0);
    expect(result.steps[1].order).toBe(1);
  });

  it('set_boundary hard adds gate step', () => {
    const card = makeEmptyPipeline();
    const intent: Intent = {
      type: 'set_boundary',
      summary: 'must pass lint check',
      enforcement: 'hard',
    };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('gate');
    expect(result.steps[0].condition).toBe('must pass lint check');
  });

  it('set_boundary soft sets revision config on matching step', () => {
    const card = makePipelineWithSteps();
    const intent: Intent = {
      type: 'set_boundary',
      summary: 'retry up to 3 times',
      enforcement: 'soft',
      entities: { target_step: 'scan code' },
    };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.steps[0].revision_target).toBe('retry up to 3 times');
    expect(result.steps[0].max_revision_cycles).toBe(3);
  });

  it('add_constraint adds branch step', () => {
    const card = makeEmptyPipeline();
    const intent: Intent = {
      type: 'add_constraint',
      summary: 'check if critical',
      entities: { on_true: 'hotfix', on_false: 'normal' },
    };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('branch');
    expect(result.steps[0].condition).toBe('check if critical');
    expect(result.steps[0].on_true).toBe('hotfix');
    expect(result.steps[0].on_false).toBe('normal');
  });

  it('modify with remove_step removes step and re-indexes', () => {
    const card: PipelineCard = {
      ...makeEmptyPipeline(),
      steps: [
        {
          order: 0, type: 'skill', label: 'scan code', skill_name: 'scan',
          instruction: null, revision_target: null, max_revision_cycles: null,
          condition: null, on_true: null, on_false: null,
        },
        {
          order: 1, type: 'skill', label: 'open issue', skill_name: 'issue',
          instruction: null, revision_target: null, max_revision_cycles: null,
          condition: null, on_true: null, on_false: null,
        },
        {
          order: 2, type: 'skill', label: 'fix code', skill_name: 'fix',
          instruction: null, revision_target: null, max_revision_cycles: null,
          condition: null, on_true: null, on_false: null,
        },
      ],
    };
    const intent: Intent = {
      type: 'modify',
      summary: 'remove open issue step',
      entities: { remove_step: 'open issue' },
    };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].label).toBe('scan code');
    expect(result.steps[0].order).toBe(0);
    expect(result.steps[1].label).toBe('fix code');
    expect(result.steps[1].order).toBe(1);
  });

  it('confirm is a no-op', () => {
    const card = makePipelineWithSteps();
    const intent: Intent = { type: 'confirm', summary: 'ok' };
    const result = applyIntentToPipelineCard(card, intent);
    expect(result.steps).toHaveLength(1);
    expect(result.name).toBeNull();
  });

  it('does not mutate original card', () => {
    const card = makeEmptyPipeline();
    const intent: Intent = { type: 'new_intent', summary: 'test' };
    applyIntentToPipelineCard(card, intent);
    expect(card.name).toBeNull();
  });
});

describe('modeToCardType pipeline', () => {
  it('pipeline_design returns pipeline', () => {
    expect(modeToCardType('pipeline_design')).toBe('pipeline');
  });
});

describe('createEmptyCard pipeline', () => {
  it('pipeline_design returns PipelineCard', () => {
    const card = createEmptyCard('pipeline_design');
    expect(card).toHaveProperty('steps');
    expect(card).toHaveProperty('proposed_skills');
    expect(card).toHaveProperty('schedule');
  });
});
