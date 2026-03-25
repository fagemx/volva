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

  it('handles YAML-sensitive characters in names', () => {
    const card = makeOrgCard({
      director: { name: 'Alice: "The Boss"', role: 'CTO #1', style: 'hands-on\ncollaborative' },
      departments: [
        { name: 'R&D: core', chief: 'Bob #2', workers: ['Carol: "dev"'], pipeline_refs: ['ci: main'] },
      ],
    });
    const result = buildOrgHierarchy(card);
    const parsed = yaml.load(result) as Record<string, Record<string, unknown>>;
    const director = parsed.organization.director as Record<string, string>;
    expect(director.name).toBe('Alice: "The Boss"');
    expect(director.role).toBe('CTO #1');
    expect(director.style).toBe('hands-on\ncollaborative');
    const depts = parsed.organization.departments as Array<Record<string, unknown>>;
    expect(depts[0].name).toBe('R&D: core');
    expect(depts[0].chief).toBe('Bob #2');
    expect((depts[0].workers as string[])[0]).toBe('Carol: "dev"');
  });

  it('handles department with empty workers and pipeline_refs', () => {
    const card = makeOrgCard({
      departments: [
        { name: 'Empty Dept', chief: null, workers: [], pipeline_refs: [] },
      ],
    });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const depts = parsed.organization.departments as Array<Record<string, unknown>>;
    expect(depts).toHaveLength(1);
    expect(depts[0].chief).toBeNull();
    expect(depts[0].workers).toEqual([]);
    expect(depts[0].pipelines).toEqual([]);
  });

  it('handles director with mixed null and non-null fields', () => {
    const card = makeOrgCard({
      director: { name: 'Alice', role: null, style: 'strict' },
    });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const director = parsed.organization.director as Record<string, string>;
    expect(director.name).toBe('Alice');
    expect(director.role).toBe('leader');
    expect(director.style).toBe('strict');
  });

  it('handles many departments', () => {
    const departments = Array.from({ length: 6 }, (_, i) => ({
      name: `Dept-${i}`,
      chief: i % 2 === 0 ? `Chief-${i}` : null,
      workers: [`Worker-${i}-a`, `Worker-${i}-b`],
      pipeline_refs: [`pipeline-${i}`],
    }));
    const card = makeOrgCard({ departments });
    const parsed = yaml.load(buildOrgHierarchy(card)) as Record<string, Record<string, unknown>>;
    const depts = parsed.organization.departments as Array<Record<string, unknown>>;
    expect(depts).toHaveLength(6);
    expect(depts[0].chief).toBe('Chief-0');
    expect(depts[1].chief).toBeNull();
  });
});
