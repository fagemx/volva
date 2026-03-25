import { describe, it, expect, vi } from 'vitest';
import { evaluateEconomic } from './economic';
import type { EvaluatorInput } from '../../schemas/decision';
import type { LLMClient } from '../../llm/client';

function makeMockLLM(response: { ok: true; data: unknown } | { ok: false; error: string }): LLMClient {
  return {
    generateStructured: vi.fn().mockResolvedValue(response),
    generateText: vi.fn(),
  } as unknown as LLMClient;
}

function makeEvaluatorInput(): EvaluatorInput {
  return {
    candidate: {
      id: 'cand-econ-1',
      regime: 'economic',
      form: 'service',
      description: 'Consulting for SMBs',
      whyThisCandidate: ['Buyer demand is strong'],
      assumptions: ['Buyers will pay $500/month'],
      probeReadinessHints: ['Landing page live'],
      timeToSignal: 'short',
      notes: ['Focus on onboarding'],
    },
    probeableForm: {
      candidateId: 'cand-econ-1',
      regime: 'economic',
      hypothesis: 'Buyer demand is strong',
      testTarget: 'buyer willingness to pay for service',
      judge: 'potential buyer',
      cheapestBelievableProbe: 'direct offer / landing page CTA for service',
      disconfirmers: ['NOT: Buyers will pay $500/month'],
    },
    signals: [
      {
        candidateId: 'cand-econ-1',
        probeId: 'probe-1',
        regime: 'economic',
        signalType: 'buyer_interview',
        strength: 'strong',
        evidence: ['Buyer confirmed pain', 'Payment discussion started'],
        interpretation: 'Strong economic signal',
        nextQuestions: ['What price?'],
      },
    ],
  };
}

describe('evaluateEconomic', () => {
  it('returns commit verdict when strong buyer + payment signals', async () => {
    const llm = makeMockLLM({
      ok: true,
      data: {
        verdict: 'commit',
        rationale: ['Strong buyer shape', 'Payment-adjacent signal exists'],
        evidenceUsed: ['Buyer confirmed pain', 'Payment discussion started'],
        unresolvedRisks: ['Churn rate unknown'],
        recommendedNextStep: ['Build MVP'],
      },
    });

    const result = await evaluateEconomic(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('commit');
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.evidenceUsed.length).toBeGreaterThan(0);
  });

  it('returns hold verdict when signals are weak', async () => {
    const llm = makeMockLLM({
      ok: true,
      data: {
        verdict: 'hold',
        rationale: ['Interest exists but not payment-adjacent'],
        evidenceUsed: ['General interest noted'],
        unresolvedRisks: ['No payment signal yet'],
        recommendedNextStep: ['Run another probe round'],
      },
    });

    const result = await evaluateEconomic(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('hold');
    expect(result.rationale).toContain('Interest exists but not payment-adjacent');
  });

  it('returns hold on LLM failure (graceful degradation)', async () => {
    const llm = makeMockLLM({
      ok: false,
      error: 'Schema validation failed',
    });

    const result = await evaluateEconomic(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('hold');
    expect(result.rationale[0]).toContain('Evaluation could not complete');
  });

  it('returns hold when LLM returns error result', async () => {
    const llm = {
      generateStructured: vi.fn().mockResolvedValue({ ok: false, error: 'Network timeout' }),
      generateText: vi.fn(),
    } as unknown as LLMClient;

    const result = await evaluateEconomic(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('hold');
    expect(result.rationale[0]).toContain('Economic evaluation failed');
  });
});
