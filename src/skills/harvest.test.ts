import { describe, it, expect, vi } from 'vitest';
import { SkillCandidateSchema, capturePattern } from './harvest';
import type { LLMClient } from '../llm/client';

// ─── Mock LLM Client ───

function createMockLlm(
  response: { ok: true; data: unknown } | { ok: false; error: string },
): LLMClient {
  return {
    generateText: vi.fn(),
    generateStructured: vi.fn().mockResolvedValue(response),
  } as unknown as LLMClient;
}

const VALID_CANDIDATE = {
  name: 'deploy-service',
  summary: 'Deploy a service to staging/production with smoke tests',
  problemShapes: ['need to deploy a service safely'],
  desiredOutcomes: ['service running in target environment'],
  nonGoals: ['infrastructure provisioning'],
  triggerWhen: ['user requests deploy of specific service'],
  doNotTriggerWhen: ['no artifact specified', 'target env unclear'],
  methodOutline: ['build artifact', 'deploy to staging', 'run smoke tests', 'promote to prod'],
  observedGotchas: ['healthcheck green does not mean checkout path safe'],
};

const SAMPLE_HISTORY = [
  { role: 'user', content: 'Deploy checkout-service to staging' },
  { role: 'assistant', content: 'Starting deploy...' },
  { role: 'user', content: 'Looks good, promote to prod' },
  { role: 'assistant', content: 'Promoted. Smoke tests passing.' },
];

// ─── Schema Tests ───

describe('SkillCandidateSchema', () => {
  it('validates a valid candidate', () => {
    const result = SkillCandidateSchema.safeParse(VALID_CANDIDATE);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = SkillCandidateSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong field types', () => {
    const result = SkillCandidateSchema.safeParse({
      ...VALID_CANDIDATE,
      problemShapes: 'not an array',
    });
    expect(result.success).toBe(false);
  });
});

// ─── capturePattern Tests ───

describe('capturePattern', () => {
  it('returns ok with valid candidate from LLM', async () => {
    const llm = createMockLlm({ ok: true, data: VALID_CANDIDATE });

    const result = await capturePattern(llm, SAMPLE_HISTORY, 'deploy workflow');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('deploy-service');
      expect(result.data.problemShapes).toHaveLength(1);
      expect(result.data.methodOutline).toHaveLength(4);
    }
  });

  it('passes conversation history and context to LLM', async () => {
    const llm = createMockLlm({ ok: true, data: VALID_CANDIDATE });

    const result = await capturePattern(llm, SAMPLE_HISTORY, 'deploy workflow');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('deploy-service');
    }
  });

  it('returns error when LLM returns invalid schema', async () => {
    const llm = createMockLlm({
      ok: false,
      error: 'Schema validation failed: missing required fields',
    });

    const result = await capturePattern(llm, SAMPLE_HISTORY, 'test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Schema validation failed');
    }
  });

  it('returns error when LLM returns failure result', async () => {
    const llm = createMockLlm({ ok: false, error: 'API rate limit exceeded' });

    const result = await capturePattern(llm, SAMPLE_HISTORY, 'test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('API rate limit exceeded');
    }
  });
});
