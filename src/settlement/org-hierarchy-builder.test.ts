import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { buildOrgHierarchy } from './org-hierarchy-builder';
import type { OrgCard } from '../schemas/card';

function makeOrgCard(overrides?: Partial<OrgCard>): OrgCard {
  return {
    director: null,
    departments: [],
    governance: { cycle: null, chief_order: [], escalation: null },
    pending: [],
    version: 1,
    ...overrides,
  };
}

describe('buildOrgHierarchy', () => {
  it('produces valid YAML string', () => {
    const card = makeOrgCard({
      director: { name: 'Alice', role: 'CTO', style: 'collaborative' },
      departments: [
        { name: 'Engineering', chief: 'Bob', workers: ['Carol'], pipeline_refs: ['ci-pipeline'] },
      ],
    });
    const result = buildOrgHierarchy(card);
    expect(typeof result).toBe('string');
    expect(() => yaml.load(result)).not.toThrow();
  });

  it('maps director fields correctly', () => {
    const card = makeOrgCard({
      director: { name: 'Alice', role: 'CTO', style: 'collaborative' },
    });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const org = parsed.organization;
    const director = org.director as Record<string, string>;
    expect(director.name).toBe('Alice');
    expect(director.role).toBe('CTO');
    expect(director.style).toBe('collaborative');
  });

  it('maps departments correctly', () => {
    const card = makeOrgCard({
      departments: [
        { name: 'Engineering', chief: 'Bob', workers: ['Carol', 'Dave'], pipeline_refs: ['ci'] },
        { name: 'Marketing', chief: null, workers: ['Eve'], pipeline_refs: [] },
      ],
    });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const depts = parsed.organization.departments as Array<Record<string, unknown>>;
    expect(depts).toHaveLength(2);
    expect(depts[0].name).toBe('Engineering');
    expect(depts[0].chief).toBe('Bob');
    expect(depts[0].workers).toEqual(['Carol', 'Dave']);
    expect(depts[0].pipelines).toEqual(['ci']);
    expect(depts[1].chief).toBeNull();
  });

  it('maps governance correctly', () => {
    const card = makeOrgCard({
      governance: { cycle: 'weekly', chief_order: ['eng', 'marketing'], escalation: 'escalate to director' },
    });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const gov = parsed.organization.governance as Record<string, unknown>;
    expect(gov.cycle).toBe('weekly');
    expect(gov.chief_order).toEqual(['eng', 'marketing']);
    expect(gov.escalation).toBe('escalate to director');
  });

  it('handles empty card', () => {
    const card = makeOrgCard();
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    expect(parsed.organization.director).toBeNull();
    expect(parsed.organization.departments).toEqual([]);
  });

  it('uses defaults when director fields are null', () => {
    const card = makeOrgCard({
      director: { name: null, role: null, style: null },
    });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const director = parsed.organization.director as Record<string, string>;
    expect(director.name).toBe('Director');
    expect(director.role).toBe('leader');
    expect(director.style).toBe('neutral');
  });
});
