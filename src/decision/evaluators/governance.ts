import type { EvaluatorInput, EvaluatorOutput } from '../../schemas/decision';
import { EvaluatorOutputSchema } from '../../schemas/decision';
import type { LLMClient } from '../../llm/client';
import { defaultHoldOutput } from './types';

const GOVERNANCE_EVALUATOR_PROMPT = `You are a governance regime evaluator for a decision system.

Your job is to assess whether a realization candidate has enough world density, closure mechanisms, and consequence observability to justify instantiating it as a live governed world.

You must evaluate 4 signals:

A. **Minimum world has shape**: Are state, change, role, and metrics defined — not just a topic or aesthetic?
B. **One closure exists**: Can the full governance cycle run: observe -> propose -> judge -> apply -> outcome -> precedent?
C. **Consequences are visible**: Does changing the world produce observable, measurable results?
D. **Build will instantiate a world, not a dashboard**: Is this genuine governance with state and pressure, not just a tool with world aesthetics?

Verdict rules:
- **commit**: Minimum world shape exists; at least one closure cycle can run; pulse/outcome/precedent are real; what's missing is instantiation, not more imagination.
- **hold**: World form is promising but closure is incomplete — e.g., outcome visibility is unclear or governance pressure is not yet defined.
- **discard**: Essentially a tool wearing world aesthetics; or an aesthetic shell without governance density.

Output a JSON object with: verdict, rationale, evidenceUsed, unresolvedRisks, recommendedNextStep, and optionally handoffNotes.`;

function buildGovernancePrompt(input: EvaluatorInput): string {
  const candidateStr = JSON.stringify(input.candidate, null, 2);
  const probeStr = JSON.stringify(input.probeableForm, null, 2);
  const signalsStr = input.signals.length > 0
    ? JSON.stringify(input.signals, null, 2)
    : 'No signals collected yet.';

  return `Evaluate this candidate under the GOVERNANCE regime.

## Candidate
${candidateStr}

## Probeable Form
${probeStr}

## Collected Signals
${signalsStr}

Assess the 4 governance signals (world shape, closure existence, consequence visibility, world-not-dashboard) and produce your verdict.`;
}

export async function evaluateGovernance(
  llm: LLMClient,
  input: EvaluatorInput,
): Promise<EvaluatorOutput> {
  try {
    const result = await llm.generateStructured({
      system: GOVERNANCE_EVALUATOR_PROMPT,
      messages: [{ role: 'user', content: buildGovernancePrompt(input) }],
      schema: EvaluatorOutputSchema,
      schemaDescription: 'Governance evaluator verdict with rationale, evidenceUsed, unresolvedRisks, recommendedNextStep',
    });

    if (!result.ok) {
      return defaultHoldOutput('Governance evaluation failed: ' + result.error);
    }

    return result.data;
  } catch (error) {
    return defaultHoldOutput(error instanceof Error ? error.message : 'Unknown error');
  }
}
