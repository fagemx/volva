import { describe, it, expect } from 'vitest';
import { applyIntentToOrgCard } from './card-mutations';
import { createEmptyOrgCard } from './card-factories';
import type { OrgCard } from '../schemas/card';
import type { Intent } from '../schemas/intent';

function makeOrgCard(overrides?: Partial<OrgCard>): OrgCard {
  return {
    ...createEmptyOrgCard(),
    ...overrides,
  };
}

function makeIntent(opts: { type: Intent['type']; summary: string } & Omit<Partial<Intent>, 'type' | 'summary'>): Intent {
  return {
    ...opts,
  };
}

describe('applyIntentToOrgCard', () => {
  it('new_intent sets director name and role', () => {
    const card = makeOrgCard();
    const intent = makeIntent({ type: 'new_intent', summary: 'Tech Lead' });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.director).not.toBeNull();
    expect(result.director!.name).toBe('Tech Lead');
    expect(result.director!.role).toBe('Tech Lead');
  });

  it('add_info adds department with worker', () => {
    const card = makeOrgCard();
    const intent = makeIntent({
      type: 'add_info',
      summary: 'add engineering',
      entities: { Engineering: 'Alice' },
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.departments).toHaveLength(1);
    expect(result.departments[0].name).toBe('Engineering');
    expect(result.departments[0].workers).toEqual(['Alice']);
  });

  it('add_info adds worker to existing department', () => {
    const card = makeOrgCard({
      departments: [{ name: 'Engineering', chief: null, workers: ['Alice'], pipeline_refs: [] }],
    });
    const intent = makeIntent({
      type: 'add_info',
      summary: 'add bob',
      entities: { Engineering: 'Bob' },
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.departments).toHaveLength(1);
    expect(result.departments[0].workers).toEqual(['Alice', 'Bob']);
  });

  it('add_info does not duplicate worker', () => {
    const card = makeOrgCard({
      departments: [{ name: 'Engineering', chief: null, workers: ['Alice'], pipeline_refs: [] }],
    });
    const intent = makeIntent({
      type: 'add_info',
      summary: 'add alice',
      entities: { Engineering: 'Alice' },
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.departments[0].workers).toEqual(['Alice']);
  });

  it('set_boundary hard sets governance cycle', () => {
    const card = makeOrgCard();
    const intent = makeIntent({
      type: 'set_boundary',
      summary: 'weekly sync',
      enforcement: 'hard',
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.governance.cycle).toBe('weekly sync');
  });

  it('set_boundary hard with chief_order entity', () => {
    const card = makeOrgCard();
    const intent = makeIntent({
      type: 'set_boundary',
      summary: 'priority order',
      enforcement: 'hard',
      entities: { chief_order: 'engineering' },
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.governance.chief_order).toContain('engineering');
  });

  it('set_boundary soft sets escalation', () => {
    const card = makeOrgCard();
    const intent = makeIntent({
      type: 'set_boundary',
      summary: 'escalate to CTO',
      enforcement: 'soft',
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.governance.escalation).toBe('escalate to CTO');
  });

  it('add_constraint adds to chief_order', () => {
    const card = makeOrgCard();
    const intent = makeIntent({ type: 'add_constraint', summary: 'engineering first' });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.governance.chief_order).toContain('engineering first');
  });

  it('style_preference sets director style', () => {
    const card = makeOrgCard();
    const intent = makeIntent({ type: 'style_preference', summary: 'collaborative' });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.director).not.toBeNull();
    expect(result.director!.style).toBe('collaborative');
  });

  it('modify updates department chief by target_department', () => {
    const card = makeOrgCard({
      departments: [{ name: 'Engineering', chief: null, workers: [], pipeline_refs: [] }],
    });
    const intent = makeIntent({
      type: 'modify',
      summary: 'Bob',
      entities: { target_department: 'Engineering' },
    });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.departments[0].chief).toBe('Bob');
  });

  it('modify without target_department is no-op', () => {
    const card = makeOrgCard({
      departments: [{ name: 'Engineering', chief: null, workers: [], pipeline_refs: [] }],
    });
    const intent = makeIntent({ type: 'modify', summary: 'Bob' });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.departments[0].chief).toBeNull();
  });

  it('confirm is a no-op', () => {
    const card = makeOrgCard({
      departments: [{ name: 'Engineering', chief: null, workers: ['Alice'], pipeline_refs: [] }],
    });
    const intent = makeIntent({ type: 'confirm', summary: 'ok' });
    const result = applyIntentToOrgCard(card, intent);
    expect(result.departments).toHaveLength(1);
    expect(result.governance.chief_order).toHaveLength(0);
  });

  it('add_evaluator_rule is a no-op', () => {
    const card = makeOrgCard();
    const intent = makeIntent({ type: 'add_evaluator_rule', summary: 'some rule' });
    const result = applyIntentToOrgCard(card, intent);
    expect(result).toEqual(card);
  });

  it('does not mutate original card', () => {
    const card = makeOrgCard();
    const intent = makeIntent({ type: 'new_intent', summary: 'test' });
    const result = applyIntentToOrgCard(card, intent);
    expect(card.director).toBeNull();
    expect(result.director).not.toBeNull();
  });
});
