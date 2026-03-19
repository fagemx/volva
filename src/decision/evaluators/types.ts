import type { EvaluatorInput, EvaluatorOutput } from '../../schemas/decision';
import type { LLMClient } from '../../llm/client';

export interface Evaluator {
  evaluate(llm: LLMClient, input: EvaluatorInput): Promise<EvaluatorOutput>;
}

export function defaultHoldOutput(reason: string): EvaluatorOutput {
  return {
    verdict: 'hold',
    rationale: ['Evaluation could not complete: ' + reason],
    evidenceUsed: [],
    unresolvedRisks: ['Evaluation incomplete'],
    recommendedNextStep: ['Retry evaluation with more context'],
  };
}
