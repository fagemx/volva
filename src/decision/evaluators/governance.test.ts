import { describe, it, expect, vi } from 'vitest';
import { evaluateGovernance } from './governance';
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
      id: 'cand-gov-1',
      regime: 'governance',
      form: 'world',
      worldForm: 'commons',
      description: 'Community governance world',
      whyThisCandidate: ['Dense state changes', 'Clear closure cycle'],
      assumptions: ['Participants will engage in governance'],
      probeReadinessHints: ['Minimum world shape defined'],
      timeToSignal: 'medium',
      notes: ['State: member roles, resource pool', 'Change: proposal flow'],
    },
    probeableForm: {
      candidateId: 'cand-gov-1',
      regime: 'governance',
      hypothesis: 'Dense state changes; Clear closure cycle',
      testTarget: 'world density of commons',
      judge: 'world state/change closure',
      cheapestBelievableProbe: 'minimum state instantiation of commons',
      disconfirmers: ['NOT: Participants will engage in governance'],
    },
    signals: [
      {
        candidateId: 'cand-gov-1',
        probeId: 'probe-gov-1',
        regime: 'governance',
        signalType: 'world_density_check',
        strength: 'strong',
        evidence: ['State defined: roles + resources', 'Closure cycle validated'],
        interpretation: 'World has sufficient density',
        nextQuestions: ['What is the first real change proposal?'],
      },
    ],
  };
}

describe('evaluateGovernance', () => {
  it('returns commit when world density + closure signals are strong', async () => {
    const llm = makeMockLLM({
      ok: true,
      data: {
        verdict: 'commit',
        rationale: ['Minimum world shape exists', 'Closure cycle can run'],
        evidenceUsed: ['State defined: roles + resources', 'Closure cycle validated'],
        unresolvedRisks: ['Outcome visibility not yet tested'],
        recommendedNextStep: ['Instantiate first cycle'],
        handoffNotes: ['World type: commons'],
      },
    });

    const result = await evaluateGovernance(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('commit');
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.evidenceUsed.length).toBeGreaterThan(0);
  });

  it('returns discard when world is tool-in-clothing', async () => {
    const llm = makeMockLLM({
      ok: true,
      data: {
        verdict: 'discard',
        rationale: ['Essentially a tool wearing world aesthetics'],
        evidenceUsed: ['No real state changes', 'No governance pressure'],
        unresolvedRisks: ['Fundamental world density missing'],
        recommendedNextStep: ['Reconsider as tool instead of world'],
      },
    });

    const result = await evaluateGovernance(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('discard');
    expect(result.rationale).toContain('Essentially a tool wearing world aesthetics');
  });

  it('returns hold on LLM failure (graceful degradation)', async () => {
    const llm = makeMockLLM({
      ok: false,
      error: 'Schema validation failed',
    });

    const result = await evaluateGovernance(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('hold');
    expect(result.rationale[0]).toContain('Evaluation could not complete');
  });

  it('returns hold when LLM returns error result', async () => {
    const llm = {
      generateStructured: vi.fn().mockResolvedValue({ ok: false, error: 'API rate limited' }),
      generateText: vi.fn(),
    } as unknown as LLMClient;

    const result = await evaluateGovernance(llm, makeEvaluatorInput());

    expect(result.verdict).toBe('hold');
    expect(result.rationale[0]).toContain('Governance evaluation failed');
  });
});
