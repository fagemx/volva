import type { EvaluatorInput, EvaluatorOutput } from '../../schemas/decision';
import { EvaluatorOutputSchema } from '../../schemas/decision';
import type { LLMClient } from '../../llm/client';
import { defaultHoldOutput } from './types';

const ECONOMIC_EVALUATOR_PROMPT = `You are an economic regime evaluator for a decision system.

Your job is to assess whether a realization candidate has received enough real-world economic authorization (buyer / payment-adjacent signals) to justify committing to a build phase.

You must evaluate 4 signals:

A. **Buyer shape exists**: Is there a specific buyer type, pain point, and context — not just an abstract market?
B. **Payment-adjacent signal exists**: Has there been price conversation, trial willingness, booking requests, or small payment?
C. **Delivery looks possible**: Can the user actually fulfill what would be offered?
D. **Build is now the bottleneck**: Would building unlock the next signal, or should more market probing happen first?

Verdict rules:
- **commit**: At least one buyer willing to discuss actual delivery; value proposition survives scrutiny; acquisition friction is reasonable; build would improve next signal quality.
- **hold**: Interest exists but not yet payment-adjacent; buyer shape is unstable; worth another probe round but not a build.
- **discard**: Signals are vague interest only; value proposition collapses under specifics; must build extensively before knowing if it sells; no edge over consensus paths.

Output a JSON object with: verdict, rationale, evidenceUsed, unresolvedRisks, recommendedNextStep, and optionally handoffNotes.`;

function buildEconomicPrompt(input: EvaluatorInput): string {
  const candidateStr = JSON.stringify(input.candidate, null, 2);
  const probeStr = JSON.stringify(input.probeableForm, null, 2);
  const signalsStr = input.signals.length > 0
    ? JSON.stringify(input.signals, null, 2)
    : 'No signals collected yet.';

  return `Evaluate this candidate under the ECONOMIC regime.

## Candidate
${candidateStr}

## Probeable Form
${probeStr}

## Collected Signals
${signalsStr}

Assess the 4 economic signals (buyer shape, payment-adjacent signal, delivery feasibility, build-is-bottleneck) and produce your verdict.`;
}

export async function evaluateEconomic(
  llm: LLMClient,
  input: EvaluatorInput,
): Promise<EvaluatorOutput> {
  try {
    const result = await llm.generateStructured({
      system: ECONOMIC_EVALUATOR_PROMPT,
      messages: [{ role: 'user', content: buildEconomicPrompt(input) }],
      schema: EvaluatorOutputSchema,
      schemaDescription: 'Economic evaluator verdict with rationale, evidenceUsed, unresolvedRisks, recommendedNextStep',
    });

    if (!result.ok) {
      return defaultHoldOutput('Economic evaluation failed: ' + result.error);
    }

    return result.data;
  } catch (error) {
    return defaultHoldOutput(error instanceof Error ? error.message : 'Unknown error');
  }
}
