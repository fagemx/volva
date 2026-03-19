import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SkillDispatchRequestSchema,
  ForgeBuildRequestSchema,
  SkillDispatchResultSchema,
  ForgeBuildResultSchema,
  KarviErrorResponseSchema,
  KARVI_ERROR_CODES,
} from './schemas';

const fixturesDir = join(__dirname, 'fixtures');

function loadFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, relativePath), 'utf-8'));
}

describe('Contract: Request Schemas', () => {
  it('skill-dispatch-request.json validates against SkillDispatchRequestSchema', () => {
    const fixture = loadFixture('requests/skill-dispatch-request.json');
    const result = SkillDispatchRequestSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('forge-build-request-economic.json validates against ForgeBuildRequestSchema', () => {
    const fixture = loadFixture('requests/forge-build-request-economic.json');
    const result = ForgeBuildRequestSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('forge-build-request-governance.json validates against ForgeBuildRequestSchema', () => {
    const fixture = loadFixture('requests/forge-build-request-governance.json');
    const result = ForgeBuildRequestSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });
});

describe('Contract: Response Schemas', () => {
  it('skill-dispatch-result.json validates against SkillDispatchResultSchema', () => {
    const fixture = loadFixture('responses/skill-dispatch-result.json');
    const result = SkillDispatchResultSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it('forge-build-result.json validates against ForgeBuildResultSchema', () => {
    const fixture = loadFixture('responses/forge-build-result.json');
    const result = ForgeBuildResultSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });
});

describe('Contract: Error Codes', () => {
  it('all 9 error codes are defined in KARVI_ERROR_CODES', () => {
    expect(KARVI_ERROR_CODES).toHaveLength(9);
  });

  it.each(KARVI_ERROR_CODES)('%s error fixture validates', (code) => {
    const filename = code.toLowerCase().replace(/_/g, '-') + '.json';
    const fixture = loadFixture(`responses/errors/${filename}`);
    const result = KarviErrorResponseSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });
});

describe('Contract: SSE Events', () => {
  const eventTypes = ['step-started', 'step-completed', 'progress', 'dispatch-completed', 'build-completed', 'error'];

  it.each(eventTypes)('%s event fixture exists and has correct structure', (eventType) => {
    const fixture = loadFixture(`sse-events/${eventType}.json`) as { event: string; data: unknown };
    expect(fixture).toHaveProperty('event');
    expect(fixture).toHaveProperty('data');
    expect(typeof fixture.event).toBe('string');
    expect(typeof fixture.data).toBe('object');
  });
});

describe('Contract: Enums', () => {
  it('EXECUTION_MODES match schema enum', () => {
    const fixture = loadFixture('enums.json') as { EXECUTION_MODES: string[] };
    const schemaValues = ['advisory', 'assistive', 'active', 'destructive'];
    expect(fixture.EXECUTION_MODES).toEqual(schemaValues);
  });

  it('REGIMES match schema enum', () => {
    const fixture = loadFixture('enums.json') as { REGIMES: string[] };
    const schemaValues = ['economic', 'capability', 'leverage', 'expression', 'governance', 'identity'];
    expect(fixture.REGIMES).toEqual(schemaValues);
  });

  it('WORLD_FORMS match schema enum', () => {
    const fixture = loadFixture('enums.json') as { WORLD_FORMS: string[] };
    const schemaValues = ['market', 'commons', 'town', 'port', 'night_engine', 'managed_knowledge_field'];
    expect(fixture.WORLD_FORMS).toEqual(schemaValues);
  });
});
